# README Backend EduSphere - Module 0 (Sans Docker - Local)

## 🚀 Initialisation Locale (Sans Docker)

### 1. PostgreSQL Local
```bash
sudo apt install postgresql
sudo -u postgres psql
CREATE DATABASE edusphere;
CREATE USER postgres WITH PASSWORD 'password';
\q
```

### 2. Backend
```bash
cd edusphere-backend
npm install
npx prisma db push
npm run start:dev
```

**API prête sur http://localhost:3000**

*(Docker supprimé - DB locale)*

## Variables d'environnement

- `TWILIO_SENDGRID_API_KEY` pour l'envoi d'emails via Twilio SendGrid
- `TWILIO_EMAIL_FROM` pour l'expéditeur email
- `CLOUDINARY_CLOUD_NAME` pour activer Cloudinary, sinon le backend stocke les logos en local
- `CLOUDINARY_API_KEY` pour activer Cloudinary, sinon le backend stocke les logos en local
- `CLOUDINARY_API_SECRET` pour activer Cloudinary, sinon le backend stocke les logos en local
