# Imagen base ligera con Node 20
FROM node:20-alpine

# Directorio de trabajo en el contenedor
WORKDIR /app

# Copia solo manifiestos primero para cachear la instalación
COPY package*.json ./

# Instala dependencias de producción (incluye telegraf)
RUN npm ci --omit=dev

# Copia el resto del código
COPY . .

# Modo producción
ENV NODE_ENV=production

# Comando de arranque (usa tu script start)
CMD ["npm", "start"]
