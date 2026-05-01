from sqlalchemy import Column, Integer, String, Boolean, Enum, DateTime, ForeignKey, create_engine
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime
import enum
import os

Base = declarative_base()

# ── DB 연결 ───────────────────────────────────────────────────
# Cloud Run: postgresql+psycopg2://user:pw@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
# 로컬 개발: postgresql+psycopg2://user:pw@localhost:5432/dbname
_db_url = os.getenv('DATABASE_URL', 'sqlite:///./yak.db')

if _db_url.startswith('sqlite'):
    ENGINE = create_engine(_db_url, echo=False, connect_args={'check_same_thread': False})
else:
    ENGINE = create_engine(
        _db_url,
        echo=False,
        pool_pre_ping=True,     # 끊어진 연결 자동 감지
        pool_size=5,
        max_overflow=10,
    )


class InventoryType(str, enum.Enum):
    normal    = 'normal'     # 정상 입고
    returned  = 'return'     # 변심반품 입고
    defective = 'defective'  # 불량 입고 (현재고 제외)


class Product(Base):
    __tablename__ = 'products'
    id          = Column(Integer, primary_key=True, autoincrement=True)
    name        = Column(String, nullable=False)
    color       = Column(String, nullable=False)
    size        = Column(String, nullable=False)
    model_code  = Column(String, default='')
    barcode     = Column(String, default='')
    active      = Column(Boolean, default=True)
    orders      = relationship('Order', back_populates='product')
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
    id          = Column(Integer, primary_key=True, autoincrement=True)
    date        = Column(String, nullable=False)
    product_id  = Column(Integer, ForeignKey('products.id'))
    quantity    = Column(Integer, nullable=False)
    type        = Column(Enum(InventoryType), default=InventoryType.normal)
    notes       = Column(String, default='')
    created_at  = Column(DateTime, default=datetime.now)
    product     = relationship('Product', back_populates='inventories')


class MappingRule(Base):
    __tablename__ = 'mapping_rules'
    id          = Column(Integer, primary_key=True, autoincrement=True)
    rule_name   = Column(String, default='')
    product_id  = Column(Integer, ForeignKey('products.id'), nullable=True)
    match_type  = Column(String, default='and')
    keywords    = Column(String, default='[]')
    enabled     = Column(Boolean, default=True)
    priority    = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.now)
    product     = relationship('Product')


def init_db():
    Base.metadata.create_all(ENGINE)
