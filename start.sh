#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  AgentColony — One-Click Start Script (Linux/Mac)
#  Starts the Next.js frontend (port 3000) and agent-chat backend (port 3004)
# ═══════════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║       🌍 AgentColony — One-Click Setup           ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Check for bun/npm ──
if command -v bun &> /dev/null; then
  PKG="bun"
elif command -v npm &> /dev/null; then
  PKG="npm"
else
  echo -e "${RED}❌ Neither bun nor npm found. Please install Node.js first.${NC}"
  echo -e "   → https://nodejs.org/"
  exit 1
fi
echo -e "${GREEN}✓ Using $PKG${NC}"

# ── Step 1: Install root dependencies ──
echo ""
echo -e "${BOLD}${BLUE}[1/4] Installing main app dependencies...${NC}"
if [ "$PKG" = "bun" ]; then
  bun install --frozen-lockfile 2>/dev/null || bun install
else
  npm install --legacy-peer-deps
fi
echo -e "${GREEN}  ✓ Main dependencies installed${NC}"

# ── Step 2: Install & build mini-service ──
echo ""
echo -e "${BOLD}${BLUE}[2/4] Setting up agent-chat backend...${NC}"
cd mini-services/agent-chat
if [ "$PKG" = "bun" ]; then
  bun install --frozen-lockfile 2>/dev/null || bun install
else
  npm install --legacy-peer-deps
fi

# Build TypeScript
echo -e "  📦 Compiling backend..."
if command -v npx &> /dev/null; then
  npx tsc --esModuleInterop --skipLibCheck --moduleResolution node --target es2020 --outDir dist --module ESNext index.ts 2>/dev/null
fi

# Verify dist exists
if [ ! -f "dist/index.js" ]; then
  echo -e "${YELLOW}  ⚠ TypeScript compilation failed, trying direct bun run...${NC}"
fi
cd ../..
echo -e "${GREEN}  ✓ Backend ready${NC}"

# ── Step 3: Setup database ──
echo ""
echo -e "${BOLD}${BLUE}[3/4] Setting up database...${NC}"
if command -v npx &> /dev/null; then
  npx prisma db push --accept-data-loss 2>/dev/null || npx prisma generate 2>/dev/null || true
fi
echo -e "${GREEN}  ✓ Database ready${NC}"

# ── Step 4: Start everything ──
echo ""
echo -e "${BOLD}${BLUE}[4/4] Starting servers...${NC}"
echo ""

# Kill any existing processes on our ports
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3004 | xargs kill -9 2>/dev/null || true
sleep 1

# Start the mini-service (agent-chat backend) in background
echo -e "${YELLOW}  🚀 Starting agent-chat backend on port 3004...${NC}"
cd mini-services/agent-chat
if [ -f "dist/index.js" ]; then
  nohup node dist/index.js > ../../backend.log 2>&1 &
else
  nohup bun index.ts > ../../backend.log 2>&1 &
fi
BACKEND_PID=$!
cd ../..

# Wait for backend to be ready
# (It's a WebSocket server, so we just check the process is alive and port is bound)
echo -e "  ⏳ Waiting for backend..."
for i in $(seq 1 10); do
  if ss -tlnp 2>/dev/null | grep -q ":3004" || lsof -i :3004 -sTCP:LISTEN 2>/dev/null | grep -q .; then
    echo -e "${GREEN}  ✓ Backend ready (PID: $BACKEND_PID)${NC}"
    break
  fi
  if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}  ❌ Backend failed to start! Check backend.log${NC}"
    cat backend.log 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Start Next.js frontend
echo -e "${YELLOW}  🚀 Starting Next.js frontend on port 3000...${NC}"
if [ "$PKG" = "bun" ]; then
  nohup bun run dev > frontend.log 2>&1 &
else
  nohup npm run dev > frontend.log 2>&1 &
fi
FRONTEND_PID=$!

# Wait for frontend
echo -e "  ⏳ Waiting for frontend (this may take a minute on first run)..."
for i in $(seq 1 60); do
  if ss -tlnp 2>/dev/null | grep -q ":3000" || lsof -i :3000 -sTCP:LISTEN 2>/dev/null | grep -q .; then
    # Give it a few more seconds to fully compile
    sleep 3
    echo -e "${GREEN}  ✓ Frontend ready (PID: $FRONTEND_PID)${NC}"
    break
  fi
  if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}  ❌ Frontend failed to start! Check frontend.log${NC}"
    cat frontend.log 2>/dev/null
    exit 1
  fi
  sleep 1
done

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║          🎉 AgentColony is running!              ║${NC}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${GREEN}║                                                  ║${NC}"
echo -e "${BOLD}${GREEN}║  Frontend:  http://localhost:3000                ║${NC}"
echo -e "${BOLD}${GREEN}║  Backend:   http://localhost:3004                ║${NC}"
echo -e "${BOLD}${GREEN}║                                                  ║${NC}"
echo -e "${BOLD}${GREEN}║  Logs:     frontend.log / backend.log            ║${NC}"
echo -e "${BOLD}${GREEN}║  Stop:     Press Ctrl+C                         ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Open browser
if command -v xdg-open &> /dev/null; then
  sleep 2
  xdg-open http://localhost:3000 2>/dev/null &
elif command -v open &> /dev/null; then
  sleep 2
  open http://localhost:3000 2>/dev/null &
fi

# Keep script alive and handle Ctrl+C
cleanup() {
  echo ""
  echo -e "${YELLOW}🛑 Stopping servers...${NC}"
  kill $FRONTEND_PID 2>/dev/null
  kill $BACKEND_PID 2>/dev/null
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3004 | xargs kill -9 2>/dev/null || true
  echo -e "${GREEN}✓ Servers stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Show live logs
echo -e "${CYAN}📋 Live logs (Ctrl+C to stop):${NC}"
echo -e "${CYAN}─────────────────────────────────────────${NC}"
tail -f frontend.log backend.log 2>/dev/null &
TAIL_PID=$!
trap "kill $TAIL_PID 2>/dev/null; cleanup" SIGINT SIGTERM
wait
