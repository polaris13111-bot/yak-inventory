import json
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from models import ENGINE, init_db, Product, Order, InventoryItem, InventoryType, MappingRule

init_db()
SessionLocal = sessionmaker(bind=ENGINE)

# ── 시드 데이터 (DB가 비어있을 때 상품 자동 등록) ─────────
def _do_seed(db):
    _seed_file = Path(__file__).parent / 'seed_products.json'
    if not _seed_file.exists():
        return 0
    data = json.loads(_seed_file.read_text(encoding='utf-8'))
    for p in data:
        db.add(Product(
            name=p['name'], color=p['color'],
            size=p['size'], model_code=p.get('model_code')
        ))
    db.commit()
    return len(data)

def _seed_products():
    try:
        db = SessionLocal()
        try:
            if db.query(Product).count() == 0:
                n = _do_seed(db)
                print(f'[seed] 상품 {n}개 등록 완료')
        finally:
            db.close()
    except Exception as e:
        print(f'[seed] 실패: {e}')

_seed_products()

app = FastAPI(title='야크 재고관리 API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Pydantic 스키마 ──────────────────────────────────────

class ProductIn(BaseModel):
    name: str
    color: str
    size: str
    model_code: str = ''

class ProductOut(BaseModel):
    id: int
    name: str
    color: str
    size: str
    model_code: str
    model_config = {'from_attributes': True}

class OrderIn(BaseModel):
    date: str
    product_id: int
    quantity: int
    order_date: str = ''
    storage: str = '뉴페이스'
    mall: str = ''
    orderer: str = ''
    recipient: str = ''
    phone: str = ''
    address: str = ''
    memo: str = ''

class OrderOut(OrderIn):
    id: int
    product: Optional[ProductOut] = None
    created_at: datetime
    model_config = {'from_attributes': True}

class InventoryIn(BaseModel):
    date: str
    product_id: int
    quantity: int
    type: InventoryType = InventoryType.normal
    notes: str = ''

class InventoryOut(InventoryIn):
    id: int
    product: Optional[ProductOut] = None
    created_at: datetime
    model_config = {'from_attributes': True}

class StockSummaryOut(BaseModel):
    product: ProductOut
    total_in: int
    total_out: int
    current_stock: int
    low_stock: bool

class DailyOutboundOut(BaseModel):
    date: str
    product_id: int
    quantity: int

class MappingRuleIn(BaseModel):
    rule_name: str = ''
    product_id: Optional[int] = None
    match_type: str = 'and'    # 'and' | 'or'
    keywords: list[str] = []
    enabled: bool = True
    priority: int = 0

class MappingRuleOut(MappingRuleIn):
    id: int
    product: Optional[ProductOut] = None
    created_at: datetime
    model_config = {'from_attributes': True}

    @classmethod
    def from_orm_rule(cls, rule: MappingRule) -> 'MappingRuleOut':
        return cls(
            id=rule.id,
            rule_name=rule.rule_name,
            product_id=rule.product_id,
            match_type=rule.match_type,
            keywords=json.loads(rule.keywords or '[]'),
            enabled=rule.enabled,
            priority=rule.priority,
            created_at=rule.created_at,
            product=rule.product,
        )

class ResolveIn(BaseModel):
    product_name: str   # 상품명 원본 텍스트


@app.post('/admin/seed-products')
def seed_products_api(db: Session = Depends(get_db)):
    cnt = db.query(Product).count()
    if cnt > 0:
        return {'ok': False, 'message': f'이미 {cnt}개 상품 존재'}
    n = _do_seed(db)
    return {'ok': True, 'inserted': n}

# ─── 제품 ────────────────────────────────────────────────

@app.get('/products', response_model=list[ProductOut])
def get_products(db: Session = Depends(get_db)):
    return db.query(Product).order_by(Product.name, Product.color, Product.size).all()


@app.post('/products', response_model=ProductOut)
def create_product(data: ProductIn, db: Session = Depends(get_db)):
    # 중복 체크
    exists = db.query(Product).filter(
        Product.name == data.name,
        Product.color == data.color,
        Product.size == data.size,
    ).first()
    if exists:
        raise HTTPException(400, '이미 존재하는 제품입니다')
    p = Product(**data.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@app.put('/products/{product_id}', response_model=ProductOut)
def update_product(product_id: int, data: ProductIn, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, '제품을 찾을 수 없습니다')
    p.name = data.name
    p.color = data.color
    p.size = data.size
    p.model_code = data.model_code
    db.commit()
    db.refresh(p)
    return p


@app.delete('/products/{product_id}')
def delete_product(product_id: int, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, '제품을 찾을 수 없습니다')
    db.delete(p)
    db.commit()
    return {'ok': True}


# ─── 발주 ────────────────────────────────────────────────

@app.get('/orders', response_model=list[OrderOut])
def get_orders(
    month: Optional[str] = None,
    date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Order)
    if month:
        q = q.filter(Order.date.like(f'{month}.%'))
    if date:
        q = q.filter(Order.date == date)
    return q.order_by(Order.date).all()


@app.post('/orders', response_model=OrderOut)
def create_order(data: OrderIn, db: Session = Depends(get_db)):
    if not db.get(Product, data.product_id):
        raise HTTPException(404, '제품을 찾을 수 없습니다')
    order = Order(**data.model_dump())
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@app.put('/orders/{order_id}', response_model=OrderOut)
def update_order(order_id: int, data: OrderIn, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, '발주를 찾을 수 없습니다')
    if not db.get(Product, data.product_id):
        raise HTTPException(404, '제품을 찾을 수 없습니다')
    for k, v in data.model_dump().items():
        setattr(order, k, v)
    db.commit()
    db.refresh(order)
    return order


@app.delete('/orders/{order_id}')
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(404, '발주를 찾을 수 없습니다')
    db.delete(order)
    db.commit()
    return {'ok': True}

@app.post('/orders/batch-delete')
def batch_delete_orders(body: dict, db: Session = Depends(get_db)):
    from sqlalchemy import delete as sa_delete
    ids: list[int] = body.get('ids', [])
    if not ids:
        return {'deleted': 0}
    result = db.execute(sa_delete(Order).where(Order.id.in_(ids)))
    db.commit()
    return {'deleted': result.rowcount}

@app.post('/orders/bulk')
def create_orders_bulk(data: list[OrderIn], db: Session = Depends(get_db)):
    if len(data) > 500:
        raise HTTPException(400, f'한 번에 최대 500건까지 등록 가능합니다 (요청: {len(data)}건)')
    valid_pids = {p.id for p in db.query(Product).all()}
    ok = 0; fail = []
    for order_data in data:
        if order_data.product_id not in valid_pids:
            fail.append({'product_id': order_data.product_id, 'reason': '제품 없음'})
            continue
        db.add(Order(**order_data.model_dump()))
        ok += 1
    db.commit()
    return {'ok': ok, 'fail': fail}


# ─── 입고 ────────────────────────────────────────────────

@app.get('/inventory', response_model=list[InventoryOut])
def get_inventory(month: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(InventoryItem)
    if month:
        q = q.filter(InventoryItem.date.like(f'{month}.%'))
    return q.order_by(InventoryItem.date).all()


@app.post('/inventory', response_model=InventoryOut)
def create_inventory(data: InventoryIn, db: Session = Depends(get_db)):
    if not db.get(Product, data.product_id):
        raise HTTPException(404, '제품을 찾을 수 없습니다')
    item = InventoryItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.post('/inventory/bulk')
def create_inventory_bulk(data: list[InventoryIn], db: Session = Depends(get_db)):
    if len(data) > 500:
        raise HTTPException(400, f'한 번에 최대 500건까지 등록 가능합니다 (요청: {len(data)}건)')
    valid_pids = {p.id for p in db.query(Product).all()}
    ok = 0; fail = []
    for item_data in data:
        if item_data.product_id not in valid_pids:
            fail.append({'product_id': item_data.product_id, 'reason': '제품 없음'})
            continue
        db.add(InventoryItem(**item_data.model_dump()))
        ok += 1
    db.commit()
    return {'ok': ok, 'fail': fail}


@app.put('/inventory/{item_id}', response_model=InventoryOut)
def update_inventory(item_id: int, data: InventoryIn, db: Session = Depends(get_db)):
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(404, '입고 항목을 찾을 수 없습니다')
    if not db.get(Product, data.product_id):
        raise HTTPException(404, '제품을 찾을 수 없습니다')
    for k, v in data.model_dump().items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@app.delete('/inventory/{item_id}')
def delete_inventory(item_id: int, db: Session = Depends(get_db)):
    item = db.get(InventoryItem, item_id)
    if not item:
        raise HTTPException(404, '입고 항목을 찾을 수 없습니다')
    db.delete(item)
    db.commit()
    return {'ok': True}


# ─── 재고 현황 ───────────────────────────────────────────

@app.get('/stock/summary', response_model=list[StockSummaryOut])
def get_stock_summary(month: Optional[str] = None, db: Session = Depends(get_db)):
    products = db.query(Product).order_by(Product.name, Product.color, Product.size).all()

    inv_q = db.query(InventoryItem.product_id, func.sum(InventoryItem.quantity).label('total'))
    if month:
        inv_q = inv_q.filter(InventoryItem.date.like(f'{month}.%'))
    inv_map = {r.product_id: r.total for r in inv_q.group_by(InventoryItem.product_id).all()}

    ord_q = db.query(Order.product_id, func.sum(Order.quantity).label('total'))
    if month:
        ord_q = ord_q.filter(Order.date.like(f'{month}.%'))
    ord_map = {r.product_id: r.total for r in ord_q.group_by(Order.product_id).all()}

    result = []
    for p in products:
        total_in  = inv_map.get(p.id, 0)
        total_out = ord_map.get(p.id, 0)
        current   = total_in - total_out
        result.append(StockSummaryOut(
            product=p, total_in=total_in, total_out=total_out,
            current_stock=current, low_stock=current < 1,
        ))
    return result


@app.get('/stock/daily', response_model=list[DailyOutboundOut])
def get_daily_outbound(month: str, db: Session = Depends(get_db)):
    rows = db.query(
        Order.date, Order.product_id,
        func.sum(Order.quantity).label('quantity'),
    ).filter(Order.date.like(f'{month}.%')).group_by(Order.date, Order.product_id).all()
    return [DailyOutboundOut(date=r.date, product_id=r.product_id, quantity=r.quantity)
            for r in rows]


# ─── 매핑 규칙 ───────────────────────────────────────────

@app.get('/mapping-rules', response_model=list[MappingRuleOut])
def get_mapping_rules(db: Session = Depends(get_db)):
    rules = db.query(MappingRule).order_by(MappingRule.priority.desc(), MappingRule.id).all()
    return [MappingRuleOut.from_orm_rule(r) for r in rules]


@app.post('/mapping-rules', response_model=MappingRuleOut)
def create_mapping_rule(data: MappingRuleIn, db: Session = Depends(get_db)):
    rule = MappingRule(
        rule_name=data.rule_name,
        product_id=data.product_id,
        match_type=data.match_type,
        keywords=json.dumps(data.keywords, ensure_ascii=False),
        enabled=data.enabled,
        priority=data.priority,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return MappingRuleOut.from_orm_rule(rule)


@app.put('/mapping-rules/{rule_id}', response_model=MappingRuleOut)
def update_mapping_rule(rule_id: int, data: MappingRuleIn, db: Session = Depends(get_db)):
    rule = db.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(404, '규칙을 찾을 수 없습니다')
    rule.rule_name  = data.rule_name
    rule.product_id = data.product_id
    rule.match_type = data.match_type
    rule.keywords   = json.dumps(data.keywords, ensure_ascii=False)
    rule.enabled    = data.enabled
    rule.priority   = data.priority
    db.commit()
    db.refresh(rule)
    return MappingRuleOut.from_orm_rule(rule)


@app.delete('/mapping-rules/{rule_id}')
def delete_mapping_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(404, '규칙을 찾을 수 없습니다')
    db.delete(rule)
    db.commit()
    return {'ok': True}


@app.patch('/mapping-rules/{rule_id}/toggle')
def toggle_mapping_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.get(MappingRule, rule_id)
    if not rule:
        raise HTTPException(404, '규칙을 찾을 수 없습니다')
    rule.enabled = not rule.enabled
    db.commit()
    return {'id': rule.id, 'enabled': rule.enabled}


@app.post('/mapping-rules/resolve')
def resolve_product(data: ResolveIn, db: Session = Depends(get_db)):
    """
    상품명 텍스트 → product_id 자동 해석.
    우선순위 높은 규칙부터 순서대로 검사.
    """
    text = data.product_name.strip()
    rules = db.query(MappingRule).filter(MappingRule.enabled == True).order_by(
        MappingRule.priority.desc(), MappingRule.id
    ).all()

    for rule in rules:
        keywords = json.loads(rule.keywords or '[]')
        if not keywords:
            continue
        normalized = text.upper()
        kws = [k.upper() for k in keywords]
        if rule.match_type == 'and':
            matched = all(k in normalized for k in kws)
        else:  # 'or'
            matched = any(k in normalized for k in kws)
        if matched and rule.product_id:
            product = db.get(Product, rule.product_id)
            if product:
                return {'product_id': rule.product_id, 'product': ProductOut.model_validate(product)}
    return {'product_id': None, 'product': None}


@app.post('/mapping-rules/seed-defaults')
def seed_default_rules(db: Session = Depends(get_db)):
    """
    스프레드시트 출고관리 검색조건 기반 기본 규칙 자동 생성.
    이미 규칙이 있으면 건너뜀.
    """
    cnt = db.query(MappingRule).count()
    if cnt > 0:
        return {'message': '이미 규칙이 존재합니다', 'count': cnt}

    products = {(p.name, p.color, p.size): p.id
                for p in db.query(Product).all()}

    rules_to_create = []

    # OR 방식 - 용품 3종
    bag_rules = [
        ('야크커뮤트 힙색',   '블랙', '단품', ['힙색', '8BYABF3902'],  'or'),
        ('야크커뮤트 슬링백', '블랙', '단품', ['슬링백', '8BYABF3901'], 'or'),
        ('야크커뮤트 백팩',   '블랙', '단품', ['백팩', '8BYKSF3901'],  'or'),
    ]
    for name, color, size, kws, mtype in bag_rules:
        pid = products.get((name, color, size))
        if pid:
            rules_to_create.append(MappingRule(
                rule_name=f'{name}',
                product_id=pid,
                match_type=mtype,
                keywords=json.dumps(kws, ensure_ascii=False),
                enabled=True, priority=10,
            ))

    # AND 방식 - 의류 (제품명 키워드 + 색상 + 사이즈)
    clothing = [
        ('H티아고 자켓',    '블랙',       ['티아고', '블랙']),
        ('H티아고 자켓',    '그레이',     ['티아고', '그레이']),
        ('H포그 윈드자켓',  '그레이',     ['윈드', '그레이']),
        ('H포그 윈드자켓',  '카키',       ['윈드', '카키']),
        ('H미토 윈드자켓',  '블랙',       ['미토', '블랙']),
        ('H주빌로 자켓',    '블루',       ['주빌로', '블루']),
        ('H주빌로 자켓',    '라이트베이지', ['주빌로', '베이지']),
        ('H주빌로 자켓',    '라이트그레이', ['주빌로', '그레이']),
        ('H피레스코 티셔츠', '블랙',      ['피레스코', '블랙']),
        ('H피레스코 티셔츠', '화이트',    ['피레스코', '화이트']),
    ]
    sizes = ['90', '95', '100', '105', '110', '115']
    for name, color, base_kws in clothing:
        for size in sizes:
            pid = products.get((name, color, size))
            if not pid:
                continue
            kws = base_kws + [size]
            rules_to_create.append(MappingRule(
                rule_name=f'{name} / {color} / {size}',
                product_id=pid,
                match_type='and',
                keywords=json.dumps(kws, ensure_ascii=False),
                enabled=True, priority=5,
            ))

    # 미토 윈드자켓 단품 사이즈 (95~115)
    mito_sizes = ['95', '100', '105', '110', '115']
    for size in mito_sizes:
        pid = products.get(('H미토 윈드자켓', '블랙', size))
        if pid:
            rules_to_create.append(MappingRule(
                rule_name=f'H미토 윈드자켓 / 블랙 / {size}',
                product_id=pid,
                match_type='and',
                keywords=json.dumps(['미토', '블랙', size], ensure_ascii=False),
                enabled=True, priority=5,
            ))

    for rule in rules_to_create:
        db.add(rule)
    db.commit()
    return {'message': f'{len(rules_to_create)}개 기본 규칙 생성 완료', 'count': len(rules_to_create)}


# ─── React SPA 서빙 (프로덕션 빌드) ──────────────────────────
# 반드시 모든 API 라우트 등록 후 마지막에 위치
_static = Path(__file__).parent / 'static'
if _static.exists():
    # /assets, /vite.svg 등 정적 파일
    app.mount('/assets', StaticFiles(directory=str(_static / 'assets')), name='spa-assets')

    @app.get('/{full_path:path}', include_in_schema=False)
    async def serve_spa(full_path: str):
        """SPA fallback — React Router가 처리하도록 index.html 반환"""
        file_path = _static / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_static / 'index.html'))
