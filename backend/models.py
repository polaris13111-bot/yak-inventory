from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, ForeignKey, create_engine
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import enum

import os

Base = declarative_base()
# 프로덕션(Cloud Run): DATABASE_URL=/data/yak.db (GCS 마운트)
# 로컬: 현재 디렉토리의 yak.db
_db_url = os.getenv('DATABASE_URL', 'sqlite:///./yak.db')
ENGINE = create_engine(_db_url, echo=False, connect_args={'check_same_thread': False})


class InventoryType(str, enum.Enum):
    normal = 'normal'   # 정상 입고
    ret    = 'return'   # 반품 입고


class Product(Base):
    __tablename__ = 'products'
    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String, nullable=False)
    color      = Column(String, nullable=False)
    size       = Column(String, nullable=False)
    model_code = Column(String, default='')
    orders     = relationship('Order', back_populates='product')
    inventories = relationship('InventoryItem', back_populates='product')


class Order(Base):
    __tablename__ = 'orders'
    id          = Column(Integer, primary_key=True, autoincrement=True)
    date        = Column(String, nullable=False)
    product_id  = Column(Integer, ForeignKey('products.id'))
    quantity    = Column(Integer, nullable=False)
    order_date  = Column(String, default='')
    storage     = Column(String, default='뉴페이스')
    mall        = Column(String, default='')
    orderer     = Column(String, default='')
    recipient   = Column(String, default='')
    phone       = Column(String, default='')
    address     = Column(String, default='')
    memo        = Column(String, default='')
    created_at  = Column(DateTime, default=datetime.now)
    product     = relationship('Product', back_populates='orders')


class InventoryItem(Base):
    __tablename__ = 'inventory'
    id         = Column(Integer, primary_key=True, autoincrement=True)
    date       = Column(String, nullable=False)
    product_id = Column(Integer, ForeignKey('products.id'))
    quantity   = Column(Integer, nullable=False)
    type       = Column(Enum(InventoryType), default=InventoryType.normal)
    notes      = Column(String, default='')
    created_at = Column(DateTime, default=datetime.now)
    product    = relationship('Product', back_populates='inventories')


class MappingRule(Base):
    """
    대량 입력 시 상품명 텍스트 → product_id 자동 매핑 규칙.
    스프레드시트 출고관리 B열(검색조건)의 AND/OR 로직을 재현.

    match_type='and': keywords 전부 포함되어야 매칭
    match_type='or' : keywords 중 하나라도 포함되면 매칭
    keywords: JSON 배열 문자열 (예: '["티아고","블랙","90"]')
    """
    __tablename__ = 'mapping_rules'
    id         = Column(Integer, primary_key=True, autoincrement=True)
    rule_name  = Column(String, default='')         # 표시용 이름
    product_id = Column(Integer, ForeignKey('products.id'), nullable=True)
    match_type = Column(String, default='and')      # 'and' | 'or'
    keywords   = Column(String, default='[]')       # JSON array string
    enabled    = Column(Boolean, default=True)
    priority   = Column(Integer, default=0)         # 높을수록 먼저 검사
    created_at = Column(DateTime, default=datetime.now)
    product    = relationship('Product')


def init_db():
    Base.metadata.create_all(ENGINE)
