FROM node:18-alpine AS builder

# Définition du répertoire de travail
WORKDIR /usr/src/app

# Copie des fichiers de dépendances
COPY package*.json ./
COPY prisma ./prisma/

# Installation des dépendances
RUN npm install

# Copie du reste des fichiers
COPY . .

# Génération du build NestJS et du client Prisma
RUN npm run build
RUN npm run db:generate

# Etape finale : exécution
FROM node:18-alpine

WORKDIR /usr/src/app

# Copie des fichiers nécessaires depuis le builder env
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/scripts ./scripts

# Port sur lequel l'app tourne (ex: 3000)
EXPOSE 3000

# Commande pour démarrer en prod
CMD ["npm", "run", "start:prod"]
