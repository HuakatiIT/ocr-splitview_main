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
#### วิธีที่ 1: ใช้ Pre-built images จาก Docker Hub (แนะนำ)
```
# backend - pull จาก Docker Hub
docker run -d --name ocr-backend -p 3001:3001 \
  -e PORT=3001 \
  -e DB_PROVIDER=mysql \
  -e MYSQL_HOST=host.docker.internal \
  -e MYSQL_PORT=3306 \
  -e MYSQL_USER=root \
  -e MYSQL_PASS= \
  -e MYSQL_DB=ocr_users_db \
  -e TYPHOON_API_KEY=your-key \
  -v ocr-data:/data \
  n00n0i/ocr-backend:latest

# frontend - pull จาก Docker Hub
docker run -d --name ocr-frontend -p 8080:80 \
  n00n0i/ocr-frontend:latest
```

#### วิธีที่ 2: Build locally
```
# backend
docker build -t ocr-backend:local -f backend/Dockerfile .
docker run -d --name ocr-backend -p 3001:3001 \
  -e PORT=3001 \
  -e DB_PROVIDER=mysql \
  -e MYSQL_HOST=host.docker.internal \
  -e MYSQL_PORT=3306 \
  -e MYSQL_USER=root \
  -e MYSQL_PASS= \
  -e MYSQL_DB=ocr_users_db \
  -e TYPHOON_API_KEY=your-key \
  -v ocr-data:/data \
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

1. **Images** (ดึงจาก Docker Hub - ไม่ต้อง build)
   - Backend: `n00n0i/ocr-backend:latest`
   - Frontend: `n00n0i/ocr-frontend:latest`

2. ปรับค่าภายใน `k8s/backend.yaml` (ConfigMap/Secret/PVC) ให้ตรงกับ DB/Email/Typhoon ของคุณ

3. Deploy:
   ```
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/backend.yaml -f k8s/frontend.yaml
   kubectl apply -f k8s/ingress.yaml   # ถ้ามี ingress controller
   ```

4. **Architecture**:
   - Backend service: `ocr-backend` (port 3001), mounts `/data` PVC (`ocr-backend-pvc`)
   - Frontend service: `ocr-frontend` (port 80), reverse proxies `/api` และ `/v1` ไป backend
   - Ingress points ไป `ocr-frontend` (optional)

5. **Persistent Data**:
   - Backend state files (`db-config.json`, `api-keys.json`) เก็บใน `/data` mount
   - PVC: `ocr-backend-pvc` (ปรับ size ใน backend.yaml ตามต้องการ)

> **หมายเหตุ**: ขณะนี้ image backend สร้างแบบ MySQL-only (ใช้ `npm install --ignore-scripts`) ทำให้ไม่ต้องมี Oracle Instant Client หากต้องใช้ Oracle ให้ rebuild โดยติดตั้ง oracledb package และปรับ DB_PROVIDER=oracle ใน environment
