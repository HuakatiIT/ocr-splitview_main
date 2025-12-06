## OCR SplitView
แอป OCR หน้าเว็บ + API Gateway/Backend รองรับ MySQL (Oracle optional) พร้อม Proxy ไป Typhoon OCR

### Stack
- Frontend: React + Vite
- Backend: Node/Express, MySQL (Oracle optional), Typhoon OCR proxy
- Deploy: Docker, K8s manifests อยู่ใน `k8s/`

### เตรียมใช้งาน (Dev)
1) ติดตั้ง dependency
```
npm install
cd backend && npm install --production --ignore-scripts
```
2) สร้างไฟล์ `.env` จากตัวอย่าง
```
cp .env.example .env
```
แก้ค่า `TYPHOON_API_KEY`, ค่าฐานข้อมูล, อีเมล ฯลฯ

3) รันแยก service (dev)
```
# backend
cd backend
node server.js

# frontend
cd ..
npm run dev
```

### Docker (ทดสอบเร็ว)
มี Dockerfile แยก front/back
```
# backend
docker build -t ocr-backend:local -f backend/Dockerfile backend
docker run -d --name ocr-backend -p 3001:3001 \
  -e PORT=3001 \
  -e DB_PROVIDER=mysql \
  -e MYSQL_HOST=host.docker.internal \
  -e MYSQL_PORT=3306 \
  -e MYSQL_USER=root \
  -e MYSQL_PASS= \
  -e MYSQL_DB=ocr_users_db \
  -e TYPHOON_API_KEY=your-key \
  -v /tmp/ocr-data:/data \
  ocr-backend:local

# frontend (build-time API base ใช้ backend host:port)
docker build -t ocr-frontend:local -f Dockerfile.frontend --build-arg VITE_API_BASE_URL=http://localhost:3001 .
docker run -d --name ocr-frontend -p 8080:80 ocr-frontend:local
```

### K8s (ตัวอย่าง)
ไฟล์อยู่ใน `k8s/`:
- `k8s/backend.yaml` (ConfigMap/Secret/PVC + Deployment/Service)
- `k8s/frontend.yaml` (Deployment/Service)
- `k8s/ingress.yaml` (ปรับ host เอง)
- `k8s/namespace.yaml`

ขั้นตอน:
```
kubectl apply -f k8s/namespace.yaml
# ปรับค่าจริงใน backend.yaml (ConfigMap/Secret/image tag) แล้ว:
kubectl apply -f k8s/backend.yaml -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml   # ถ้าใช้ ingress controller
```

### Database
- MySQL แนะนำ ใช้สคริปต์สร้างตาราง:
```
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin','user') DEFAULT 'user',
  status ENUM('active','pending','rejected') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT IGNORE INTO users (email,password,name,role,status)
VALUES ('admin@example.com','admin123','System Admin','admin','active');
```
- Oracle: รองรับ แต่ต้องมี Instant Client และตั้ง `ORACLE_*` env

### State/Secrets
- Backend เก็บไฟล์ state ที่ `DATA_DIR` (default `/data`): `db-config.json`, `api-keys.json` → mount volume/PVC
- อย่า commit คีย์จริง/ไฟล์ state (`.gitignore` กันไว้แล้ว)
- ใช้ `.env.example` เป็นแม่แบบ

### ทดสอบ API
```
curl -X POST http://localhost:3001/v1/ocr \
  -H "Authorization: Bearer <user_api_key>" \
  -F "file=@test.jpg"
```

## Kubernetes (ตัวอย่างขั้นตอน)

1. Build images  
   - Backend: `docker build -t <registry>/ocr-backend:latest -f backend/Dockerfile backend`  
   - Frontend: `docker build -t <registry>/ocr-frontend:latest -f Dockerfile.frontend --build-arg VITE_API_BASE_URL=http://ocr-backend:3001 .`
2. Push images ขึ้น registry ที่ cluster ดึงได้
3. ปรับค่าภายใน `k8s/backend.yaml` (ConfigMap/Secret/PVC) ให้ตรงกับ DB/Email/Typhoon ของคุณ
4. Deploy: `kubectl apply -f k8s/backend.yaml -f k8s/frontend.yaml` (และ `k8s/ingress.yaml` ถ้ามี ingress controller)
5. Backend เก็บไฟล์ state (db-config.json, api-keys.json) ใน mount `/data` ที่มาจาก PVC ชื่อ `ocr-backend-pvc`
6. Frontend service: `ocr-frontend` (port 80), Backend service: `ocr-backend` (port 3001)

> หมายเหตุ: ขณะนี้ image backend สร้างแบบ MySQL-only โดยใช้ `npm install --ignore-scripts` ทำให้ไม่ต้องมี Oracle Instant Client หากต้องใช้ Oracle ให้ติดตั้ง oracledb + Instant Client และเปิด provider=oracle
