from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, Date, ForeignKey, create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, date
import enum
import os

Base = declarative_base()

# ── DB 연결 ───────────────────────────────────────────────────
_db_url = os.getenv('DATABASE_URL', 'sqlite:///./yak.db')
_is_sqlite = _db_url.startswith('sqlite')

if _is_sqlite:
    ENGINE = create_engine(_db_url, echo=False, connect_args={'check_same_thread': False})
else:
    ENGINE = create_engine(
        _db_url,
        echo=False,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

# APP_SCHEMA: 같은 이미지를 yak/warehouse 양쪽에 배포할 때
# Cloud Run 환경변수로 구분 (기본값 yak)
_SCHEMA     = None     if _is_sqlite else os.getenv('APP_SCHEMA', 'yak')
_PUBLIC     = None     if _is_sqlite else 'public'
_PRODUCT_FK = 'products.id' if _is_sqlite else 'public.products.id'


class InventoryType(str, enum.Enum):
    normal    = 'normal'
    returned  = 'return'
    defective = 'defective'


class Product(Base):
    __tablename__  = 'products'
    __table_args__ = ({'schema': _PUBLIC} if _PUBLIC else {})

    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String, nullable=False)
    color       = Column(String, nullable=False)
    size        = Column(String, nullable=False)
    model_code  = Column(String, default='')
    barcode     = Column(String, default='')
    active      = Column(Boolean, nullable=False, default=True)
    orders      = relationship('Order', back_populates='product')
    inventories = relationship('InventoryItem', back_populates='product')


class Order(Base):
    __tablename__ = 'orders'
    __table_args__ = ({'schema': _SCHEMA} if _SCHEMA else {})

    id          = Column(Integer, primary_key=True, autoincrement=True)
    date        = Column(Date, nullable=False)
    product_id  = Column(Integer, ForeignKey(_PRODUCT_FK), nullable=False)
    quantity    = Column(Integer, nullable=False)
    order_date  = Column(Date, nullable=True)
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
    __table_args__ = ({'schema': _SCHEMA} if _SCHEMA else {})

    id          = Column(Integer, primary_key=True, autoincrement=True)
    date        = Column(Date, nullable=False)
    product_id  = Column(Integer, ForeignKey(_PRODUCT_FK), nullable=False)
    quantity    = Column(Integer, nullable=False)
    type        = Column(Enum(InventoryType, name='inventorytype', schema='public'), default=InventoryType.normal)
    notes       = Column(String, default='')
    created_at  = Column(DateTime, default=datetime.now)
    product     = relationship('Product', back_populates='inventories')


class MappingRule(Base):
    __tablename__ = 'mapping_rules'
    __table_args__ = ({'schema': _SCHEMA} if _SCHEMA else {})

    id          = Column(Integer, primary_key=True, autoincrement=True)
    rule_name   = Column(String, default='')
    product_id  = Column(Integer, ForeignKey(_PRODUCT_FK), nullable=False)
    match_type  = Column(String, default='and')
    keywords    = Column(JSONB, default=list)
    enabled     = Column(Boolean, default=True)
    priority    = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.now)
    product     = relationship('Product')


def init_db():
    Base.metadata.create_all(ENGINE)
