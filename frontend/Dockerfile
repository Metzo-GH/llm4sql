# ==============================================================================
# Dockerfile Frontend - LLM4SQL (Node 22 Build -> Nginx Alpine Multi-Stage)
# ==============================================================================

# Étape 1 : Construction des assets statiques avec Node.js
FROM node:22-alpine AS builder

WORKDIR /app

# Copie des manifestes de dépendances
COPY package.json package-lock.json ./

# Installation propre et figée des dépendances
RUN npm ci

# Copie du code source
COPY . .

# Compilation Vite / TypeScript
RUN npm run build

# Étape 2 : Serveur de distribution ultra-léger avec Nginx Alpine
FROM nginx:alpine

# Copie de la configuration Nginx optimisée pour SPA et reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copie des fichiers compilés depuis l'étape de build
COPY --from=builder /app/dist /usr/share/nginx/html

# Exposition du port frontend
EXPOSE 5173

# Démarrage de Nginx
CMD ["nginx", "-g", "daemon off;"]
