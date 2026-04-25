FROM node:20-alpine

WORKDIR /workspace

# Сначала копируем только package manifests — слой кешируется и не
# инвалидируется при любом source-change. Потом npm ci вытягивает
# зависимости для всего workspace разом.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/api-client/package.json ./packages/api-client/
COPY packages/tokens/package.json ./packages/tokens/
COPY packages/types/package.json ./packages/types/

RUN npm ci --workspaces --include-workspace-root

COPY . .

WORKDIR /workspace/apps/web
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
