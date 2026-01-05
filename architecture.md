# OCR SplitView System Architecture

## System Overview

OCR SplitView is a web-based OCR (Optical Character Recognition) application that provides users with an intuitive interface to extract text from images. The system consists of a React-based single-page application (SPA) frontend and a Node.js/Express backend that serves as an API gateway to the Typhoon OCR service. The application supports user authentication, API key management, processing history, and administrative controls.

### Key Features
- **OCR Processing**: Real-time text extraction from uploaded images using Typhoon AI API
- **User Management**: Registration, authentication, and role-based access control
- **API Key Management**: User-specific API keys with usage limits and expiration
- **Processing History**: Local storage of OCR results with image previews
- **Batch Processing**: Support for processing multiple images simultaneously
- **Admin Dashboard**: User management and system configuration
- **Hybrid Storage**: Combination of local storage and server-side databases
- **Containerized Deployment**: Docker and Kubernetes support for scalable deployment

## High-Level Architecture Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │    │   Nginx/Ingress │    │   Kubernetes    │
│                 │    │                 │    │   Cluster       │
│  ┌────────────┐ │    │  ┌────────────┐ │    │                 │
│  │ React SPA  │◄┼────┼─►│ Frontend   │◄┼────┼─┐              │
│  │            │ │    │  │ Service    │ │    │ │              │
│  └────────────┘ │    │  └────────────┘ │    │ │              │
└─────────────────┘    └─────────────────┘    │ │              │
                                              │ │              │
┌─────────────────┐    ┌─────────────────┐    │ │  ┌─────────┐ │
│   External DB   │    │   Backend API   │    │ └─►│ Config  │ │
│   (MySQL/Oracle)│◄───┼─► Gateway       │◄┼──────►│ Maps    │ │
│                 │    │                 │    │    │ Secrets │ │
└─────────────────┘    └─────────────────┘    │    └─────────┘ │
                                              │              │
┌─────────────────┐    ┌─────────────────┐    │  ┌─────────┐ │
│ Typhoon OCR API │◄───┼─► OCR Processing│◄┼────►│ PVC     │ │
│ (External)      │    │                 │    │  │ Storage │ │
└─────────────────┘    └─────────────────┘    │  └─────────┘ │
                                              └──────────────┘
```

### Architecture Flow
1. **User Interaction**: Users interact with the React SPA in their web browser
2. **Frontend Service**: Serves static React application files
3. **Backend API Gateway**: Handles authentication, API key validation, and proxies OCR requests
4. **External OCR Service**: Typhoon AI API processes the actual OCR extraction
5. **Database Layer**: Stores user data, API keys, and configuration
6. **Storage Layer**: Persistent volume for configuration files and API keys

## Component Architecture

### Frontend Components

#### Core Components
- **App.tsx**: Main application component managing state and routing
- **LoginPage.tsx**: User authentication interface
- **RegisterPage.tsx**: User registration form
- **UploadArea.tsx**: Drag-and-drop file upload interface
- **ImageViewer.tsx**: Image display and preview component
- **JsonViewer.tsx**: JSON output display with syntax highlighting
- **HistorySidebar.tsx**: Processing history management
- **SettingsPage.tsx**: User settings and API key management
- **AdminDashboard.tsx**: Administrative user and system management

#### Component Hierarchy
```
App
├── LoginPage/RegisterPage (Authentication)
├── Header (Navigation & Status)
├── Main Content Area
│   ├── JsonViewer (OCR Results)
│   └── ImageViewer/UploadArea (Image Processing)
├── HistorySidebar (Modal)
├── SettingsPage (Modal)
├── AdminDashboard (Modal)
└── Footer (Actions & Status)
```

### Backend Services

#### API Gateway (server.js)
The backend serves as an API gateway with the following responsibilities:

- **Authentication & Authorization**: User login/logout, session management
- **API Key Management**: Generation, validation, and usage tracking
- **OCR Proxy**: Secure proxy to Typhoon OCR API with request/response transformation
- **User Management**: CRUD operations for user accounts
- **Configuration Management**: Dynamic system configuration via file-based storage
- **Database Abstraction**: Support for both MySQL and Oracle databases

#### API Endpoints
- `POST /api/login` - User authentication
- `POST /api/register` - User registration
- `POST /v1/ocr` - OCR processing (proxied to Typhoon)
- `GET/POST /api/config` - System configuration
- `GET/POST/PUT/DELETE /api/keys/*` - API key management
- `GET/PUT/DELETE /api/users/*` - User management (admin only)

### Service Layer (Frontend)

#### Core Services
- **authService.ts**: Authentication state management and API calls
- **ocrService.ts**: OCR processing orchestration and API communication
- **historyService.ts**: Local storage management for processing history
- **apiKeyService.ts**: API key retrieval and management

#### Service Interactions
```
Frontend Services
├── authService
│   ├── Local Storage (session)
│   └── Backend API (/api/login, /api/register)
├── ocrService
│   ├── apiKeyService (get user key)
│   └── Backend API (/v1/ocr)
├── historyService
│   └── Local Storage (IndexedDB/LocalStorage)
└── apiKeyService
    └── Backend API (/api/keys/*)
```

## Data Flow Diagrams

### OCR Processing Flow

```
1. User Uploads Image
        │
        ▼
2. Frontend Validation
        │
        ▼
3. API Key Retrieval
        │
        ▼
4. Backend Authentication
        │
        ▼
5. API Key Validation
        │ (Usage limits, expiration)
        ▼
6. Image Preprocessing
        │
        ▼
7. Typhoon API Call
        │
        ▼
8. Response Processing
        │
        ▼
9. Usage Tracking Update
        │
        ▼
10. Result Return to Frontend
```

### User Authentication Flow

```
Login Request
     │
     ▼
Validate Credentials
     │
     ▼
Database Query
     │
     ▼
Session Creation
     │
     ▼
Frontend State Update
     │
     ▼
Protected Route Access
```

### Batch Processing Flow

```
Multiple Files Selected
        │
        ▼
Queue Creation
        │
        ▼
Sequential Processing
    ┌───┼───┐
    │   │   │
   OCR  OCR  OCR  (Parallel processing)
    │   │   │
    └───┼───┘
        ▼
Result Aggregation
        │
        ▼
JSON Export/Batch History
```

## Deployment Architecture

### Containerization Strategy

#### Frontend Container (Dockerfile.frontend)
- **Base Image**: Nginx Alpine
- **Build Process**: Multi-stage build with Node.js for compilation
- **Static Assets**: Served via Nginx with health check endpoint
- **Configuration**: Environment-based API endpoint configuration

#### Backend Container (backend/Dockerfile)
- **Base Image**: Node.js Alpine
- **Dependencies**: Express, database drivers, OCR processing libraries
- **Configuration**: Environment variables for database and API connections
- **Volumes**: Persistent storage for configuration files

### Kubernetes Deployment

#### Namespace: ocr
Dedicated namespace for isolation and resource management

#### Frontend Deployment
- **Replicas**: 1 (can be scaled based on load)
- **Service**: ClusterIP service exposing port 80
- **Probes**: Liveness and readiness probes for health monitoring
- **Resources**: CPU and memory limits for resource management

#### Backend Deployment
- **Replicas**: 1 (can be scaled with database connection pooling)
- **Service**: ClusterIP service exposing port 3001
- **ConfigMaps**: Environment configuration for database and API settings
- **Secrets**: Sensitive data like API keys and database passwords
- **PersistentVolumeClaim**: 1Gi storage for configuration files
- **Probes**: Health checks for API endpoints

#### Ingress Configuration
- **Ingress Controller**: Nginx ingress for external access
- **SSL/TLS**: Certificate management for secure connections
- **Routing**: Path-based routing for frontend and API endpoints

### Database Architecture

#### Supported Databases
- **MySQL**: Primary relational database for user data
- **Oracle**: Alternative enterprise database support

#### Schema Design
```sql
-- Users table
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    status ENUM('active', 'pending', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys stored in JSON files for flexibility
-- Configuration stored in JSON files for dynamic updates
```

### Storage Strategy

#### Hybrid Storage Approach
- **Local Storage**: Browser-based storage for session data and processing history
- **Server Storage**: File-based storage for configuration and API keys
- **Database Storage**: Structured data for users and system metadata

#### Persistent Volumes
- **PVC**: 1Gi persistent volume for backend configuration
- **Backup Strategy**: Configuration files can be backed up via volume snapshots

## Technology Stack

### Frontend Technologies
- **Framework**: React 19.2.0 with TypeScript
- **Build Tool**: Vite 6.2.0
- **Styling**: Tailwind CSS (industrial theme)
- **Icons**: Lucide React
- **State Management**: React hooks and context
- **HTTP Client**: Fetch API (native)

### Backend Technologies
- **Runtime**: Node.js with Express 5.1.0
- **Database**: MySQL 2.3.15.3 / OracleDB 6.10.0
- **File Upload**: Multer 1.4.5
- **Email**: Nodemailer 7.0.11
- **HTTP Client**: Axios 1.7.9
- **Environment**: dotenv 16.4.7

### Infrastructure Technologies
- **Containerization**: Docker
- **Orchestration**: Kubernetes
- **Ingress**: Nginx Ingress Controller
- **Storage**: Persistent Volumes
- **Configuration**: ConfigMaps and Secrets

### External Services
- **OCR Engine**: Typhoon AI API (https://api.opentyphoon.ai/v1)
- **Email Service**: Gmail SMTP (configurable)

## Scalability Considerations

### Horizontal Scaling
- **Frontend**: Stateless React application, easily scalable
- **Backend**: Stateless API gateway, can be scaled with load balancer
- **Database**: Connection pooling and read replicas for high availability

### Performance Optimizations
- **Image Processing**: Client-side preprocessing and compression
- **Caching**: Browser caching for static assets
- **API Rate Limiting**: Built-in usage limits and throttling
- **Batch Processing**: Parallel processing for multiple images

### Monitoring and Observability
- **Health Checks**: Kubernetes probes for container health
- **Logging**: Console logging with structured error handling
- **Metrics**: API usage tracking and performance monitoring

### Security Considerations
- **Authentication**: JWT-based session management
- **Authorization**: Role-based access control (admin/user)
- **API Security**: Bearer token authentication for OCR requests
- **Data Protection**: Environment-based secrets management
- **Network Security**: Namespace isolation in Kubernetes

This architecture provides a robust, scalable, and maintainable foundation for the OCR SplitView application, supporting both development and production deployment scenarios.