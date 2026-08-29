FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Vite binds to localhost by default, which isn't reachable from outside
# the container — --host exposes it on the container's network interface.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
