#!/bin/bash
# ═══════════════════════════════════════════════════════
#  AgentColony — Stop Script (Linux/Mac)
# ═══════════════════════════════════════════════════════

echo ""
echo "🛑 Stopping AgentColony servers..."

# Kill processes on ports
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null && echo "  ✓ Frontend stopped (port 3000)" || echo "  • No frontend running"
lsof -ti:3004 2>/dev/null | xargs kill -9 2>/dev/null && echo "  ✓ Backend stopped (port 3004)" || echo "  • No backend running"

# Also kill any lingering next/bun/node processes for this project
pkill -f "next dev" 2>/dev/null
pkill -f "agent-chat.*dist/index" 2>/dev/null

echo ""
echo "✅ All servers stopped."
echo ""
