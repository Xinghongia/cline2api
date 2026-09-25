# ---- 前端构建阶段 ----
FROM node:22-alpine AS frontend

WORKDIR /src/frontend
# 先拷依赖清单利用层缓存，再装依赖、拷源码构建
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY frontend/ ./
RUN npm run build

# ---- Go 构建阶段 ----
FROM golang:1.26-alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download 2>/dev/null || true
COPY . .
# 前端产物嵌入二进制（go:embed all:frontend/dist）
COPY --from=frontend /src/frontend/dist ./frontend/dist
ARG APP_VERSION=dev
RUN CGO_ENABLED=0 go build -ldflags="-s -w -X cline-go-proxy/internal/server.appVersion=${APP_VERSION}" -o cline-proxy ./cmd/cline-proxy

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /build/cline-proxy .

EXPOSE 3457

VOLUME ["/app/data"]

ENV PORT=3457
ENV CLINE_PROXY_HOST=0.0.0.0

ENTRYPOINT ["/app/cline-proxy"]
# 容器内必须监听 0.0.0.0，否则 -p 端口映射对外不可达
CMD ["-host", "0.0.0.0", "-port", "3457"]
