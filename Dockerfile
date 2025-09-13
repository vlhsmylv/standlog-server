
# Use official Node.js LTS image
FROM node:20-alpine


# Set working directory
WORKDIR /usr/src/app


# Install dependencies
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install


# Copy source code
COPY tsconfig.json ./
COPY src ./src/


# Generate Prisma client
RUN npx prisma generate


# Build TypeScript (optional for production)
RUN npx tsc


# Expose the port
EXPOSE 4000


# Start the server
CMD ["node", "dist/server.js"]