import os, json, shutil, uuid, tempfile
from fastapi import FastAPI, UploadFile, Depends, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
import stripe

from database import get_db, SessionLocal
from models import Clinic, User, Case
from auth import hash_password, verify_password, create_token, decode_token
from ai_engine import analyze_image
from pdf_report import generate_report
from email_sender import send_report_email

app = FastAPI(title="NAQCLINIXAI API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

@app.get("/")
def root(): return {"service": "NAQCLINIXAI", "status": "live"}

# ---------- AUTH ----------
class RegisterIn(BaseModel):
    clinic_name: str
    email: EmailStr
    password: str

@app.post("/auth/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(400, "Email already registered")
    clinic = Clinic(name=body.clinic_name, email=body.email)
    db.add(clinic); db.flush()
    user = User(clinic_id=clinic.id, email=body.email, password_hash=hash_password(body.password), role="admin")
    db.add(user); db.commit()
    return {"clinic_id": clinic.id, "user_id": user.id}

@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=form.username).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    token = create_token({"sub": user.email, "uid": user.id, "cid": user.clinic_id, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/auth/me")
def me(payload=Depends(decode_token), db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=payload["uid"]).first()
    return {"id": user.id, "email": user.email, "role": user.role, "clinic_id": user.clinic_id}

# ---------- AI ANALYZE ----------
@app.post("/analyze")
async def analyze(file: UploadFile, payload=Depends(decode_token), db: Session = Depends(get_db), patient_name: str = Form("")):
    ext = os.path.splitext(file.filename)[1].lower() or ".jpg"
    fname = f"{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(UPLOAD_DIR, fname)
    with open(fpath, "wb") as f: shutil.copyfileobj(file.file, f)

    try: result = analyze_image(fpath)
    except Exception as e: raise HTTPException(400, str(e))

    case = Case(clinic_id=payload["cid"], patient_name=patient_name, image_url=f"/uploads/{fname}",
                symmetry=result["symmetry"], smile_score=result["smile_score"], midline_dev=result["midline_deviation"],
                recommendation=result["recommendation"], raw_json=json.dumps(result))
    db.add(case); db.commit(); db.refresh(case)
    return {**result, "case_id": case.id}

# ---------- DASHBOARD ----------
@app.get("/dashboard")
def dashboard(payload=Depends(decode_token), db: Session = Depends(get_db)):
    cases = db.query(Case).filter_by(clinic_id=payload["cid"]).order_by(Case.id.desc()).all()
    return {"total_cases": len(cases), "recent": [{"id": c.id, "patient": c.patient_name, "at": c.created_at.isoformat()} for c in cases[:10]]}

# ---------- PDF + EMAIL ----------
def _build_pdf_for_case(case, clinic) -> str:
    from ai_engine import FACE
    import cv2
    full_path = os.path.join("/app", case.image_url.lstrip("/"))
    img = cv2.imread(full_path); rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB); res = FACE.process(rgb)
    lms = res.multi_face_landmarks[0].landmark if res.multi_face_landmarks else []
    xy = [(p.x, p.y) for p in lms]
    out = tempfile.NamedTemporaryFile(suffix=f"_{case.id}.pdf", delete=False).name
    generate_report(case.patient_name or "", clinic.name, full_path, xy, case.symmetry, case.smile_score, case.midline_dev, case.recommendation, out)
    return out

@app.post("/report/{case_id}")
def report(case_id: int, payload=Depends(decode_token), db: Session = Depends(get_db)):
    case = db.query(Case).filter_by(id=case_id, clinic_id=payload["cid"]).first()
    if not case: raise HTTPException(404, "Case not found")
    clinic = db.query(Clinic).filter_by(id=payload["cid"]).first()
    out = _build_pdf_for_case(case, clinic)
    return FileResponse(out, media_type="application/pdf", filename=f"report_{case_id}.pdf")

class EmailIn(BaseModel):
    to_email: str
    subject: str | None = None

@app.post("/report/{case_id}/email")
def email_report(case_id: int, body: EmailIn, payload=Depends(decode_token), db: Session = Depends(get_db)):
    case = db.query(Case).filter_by(id=case_id, clinic_id=payload["cid"]).first()
    if not case: raise HTTPException(404, "Case not found")
    clinic = db.query(Clinic).filter_by(id=payload["cid"]).first()
    pdf_path = _build_pdf_for_case(case, clinic)
    try: send_report_email(body.to_email, case.patient_name or "", clinic.name, pdf_path, body.subject)
    except Exception as e: raise HTTPException(500, f"Email failed: {e}")
    finally:
        try: os.unlink(pdf_path)
        except: pass
    return {"status": "sent"}

# ---------- STRIPE ----------
class CheckoutIn(BaseModel):
    plan: str

PRICES = {"starter": 4900, "pro": 9900, "enterprise": 19900}

@app.post("/billing/checkout")
def checkout(body: CheckoutIn, payload=Depends(decode_token)):
    if body.plan not in PRICES: raise HTTPException(400, "Invalid plan")
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price_data": {"currency": "usd", "unit_amount": PRICES[body.plan], "recurring": {"interval": "month"}, "product_data": {"name": f"NAQCLINIXAI {body.plan}"}}, "quantity": 1}],
        success_url="https://app.naqclinixai.com/?billing=success",
        cancel_url="https://app.naqclinixai.com/?billing=cancel",
        client_reference_id=str(payload["cid"]),
    )
    return {"url": session.url}
