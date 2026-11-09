from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

class Clinic(Base):
    __tablename__ = "clinics"
    id         = Column(Integer, primary_key=True)
    name       = Column(String, nullable=False)
    email      = Column(String, unique=True, nullable=False)
    plan       = Column(String, default="starter")
    stripe_id  = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    users      = relationship("User", back_populates="clinic")
    cases      = relationship("Case", back_populates="clinic")

class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True)
    clinic_id     = Column(Integer, ForeignKey("clinics.id"))
    email         = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role          = Column(String, default="doctor")
    created_at    = Column(DateTime, default=datetime.utcnow)
    clinic        = relationship("Clinic", back_populates="users")

class Case(Base):
    __tablename__ = "cases"
    id             = Column(Integer, primary_key=True)
    clinic_id      = Column(Integer, ForeignKey("clinics.id"))
    patient_name   = Column(String)
    image_url      = Column(String, nullable=True)
    symmetry       = Column(Float)
    smile_score    = Column(Float)
    midline_dev    = Column(Float)
    recommendation = Column(Text)
    raw_json       = Column(Text)
    created_at     = Column(DateTime, default=datetime.utcnow)
    clinic         = relationship("Clinic", back_populates="cases")
