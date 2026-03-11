/**

- VoiceChat Signaling Server (Optional)
- Lightweight Express server for peer discovery
- Deploy to: Render.com, Heroku, Replit
- 
- KEEP-ALIVE FEATURE:
- Automatically pings /health every 30 seconds
- This prevents Render.com from sleeping the dyno
- 
- Run: node server.js
- Port: 3000 (or $PORT)
  */

const express = require(‘express’);
const http = require(‘http’);
const cors = require(‘cors’);
const path = require(‘path’);

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// In-memory peer registry (clears on restart)
const peers = new Map();
const groups = new Map();

// ============================================================================
// KEEP-ALIVE MECHANISM
// ============================================================================

let isKeepAliveActive = false;

/**

- Start self-pinging to keep Render.com awake
- Prevents dyno from sleeping (which causes cold starts)
  */
  function startKeepAlive() {
  if (isKeepAliveActive) return;
  isKeepAliveActive = true;
  
  const serverUrl = process.env.RENDER_EXTERNAL_URL || process.env.HEROKU_APP_NAME
  ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`
  : ‘http://localhost:3000’;
  
  let pingCount = 0;
  
  setInterval(async () => {
  try {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  ```
       const response = await fetch(`${serverUrl}/health`, {
           method: 'GET',
           headers: { 'User-Agent': 'VoiceChat-KeepAlive' },
           signal: controller.signal
       });
       
       clearTimeout(timeoutId);
       
       if (response.ok) {
           const data = await response.json();
           pingCount++;
           
           const now = new Date().toLocaleTimeString();
           console.log(
               `\n✅ [${pingCount}] Keep-Alive Ping @ ${now}` +
               `\n   Active Peers: ${data.peers}` +
               `\n   Groups: ${data.groups}` +
               `\n   Uptime: ${Math.floor((Date.now() - serverStartTime) / 1000)}s`
           );
       }
   } catch (err) {
       console.log(`\n⚠️  Keep-Alive Ping Failed (${err.message})`);
       console.log('   → Will retry in 30 seconds');
   }
  ```
  
  }, 30000); // Every 30 seconds
  
  console.log(`╔════════════════════════════════════════════════════════════╗ ║          🔄 KEEP-ALIVE MONITORING ACTIVATED               ║ ╠════════════════════════════════════════════════════════════╣ ║ Pinging every: 30 seconds                                  ║ ║ Purpose: Prevent Render.com dyno sleep                    ║ ║ Method: GET /health endpoint                              ║ ║ Status: ACTIVE ✅                                          ║ ╚════════════════════════════════════════════════════════════╝`);
  }

// ============================================================================
// SIGNALING ENDPOINTS
// ============================================================================

/**

- Register a new peer
- POST /api/peers/register
  */
  app.post(’/api/peers/register’, (req, res) => {
  const { peerId, username, groupId } = req.body;
  
  if (!peerId || !username) {
  return res.status(400).json({ error: ‘Missing peerId or username’ });
  }
  
  const peer = {
  peerId,
  username,
  groupId: groupId || ‘global’,
  timestamp: Date.now(),
  ip: req.ip,
  };
  
  peers.set(peerId, peer);
  
  if (!groups.has(peer.groupId)) {
  groups.set(peer.groupId, new Set());
  }
  groups.get(peer.groupId).add(peerId);
  
  console.log(`✅ Peer registered: ${username} (${peerId.slice(0, 8)}...)`);
  
  res.json({
  success: true,
  peerId,
  message: ‘Peer registered’,
  serverTime: Date.now(),
  });
  });

/**

- Get peers in a group
- GET /api/groups/:groupId/peers
  */
  app.get(’/api/groups/:groupId/peers’, (req, res) => {
  const { groupId } = req.params;
  const groupPeers = groups.get(groupId);
  
  if (!groupPeers) {
  return res.json({ peers: [] });
  }
  
  const peerList = Array.from(groupPeers)
  .map(peerId => peers.get(peerId))
  .filter(p => p)
  .map(p => ({
  peerId: p.peerId,
  username: p.username,
  timestamp: p.timestamp,
  }));
  
  res.json({ peers: peerList });
  });

/**

- Remove a peer (heartbeat check)
- DELETE /api/peers/:peerId
  */
  app.delete(’/api/peers/:peerId’, (req, res) => {
  const { peerId } = req.params;
  const peer = peers.get(peerId);
  
  if (peer) {
  const group = groups.get(peer.groupId);
  if (group) {
  group.delete(peerId);
  }
  peers.delete(peerId);
  console.log(`❌ Peer removed: ${peer.username}`);
  }
  
  res.json({ success: true });
  });

/**

- KEEP-ALIVE: Health check endpoint
- GET /health
- 
- This endpoint is pinged every 30 seconds to:
- 1. Keep Render.com dyno awake
- 1. Monitor server health
- 1. Return current stats
   */
   app.get(’/health’, (req, res) => {
   const uptime = Math.floor((Date.now() - serverStartTime) / 1000);
  
  res.json({
  status: ‘ok’,
  timestamp: new Date().toISOString(),
  peers: peers.size,
  groups: groups.size,
  uptime: uptime,
  uptime_readable: formatUptime(uptime),
  keep_alive: {
  enabled: isKeepAliveActive,
  interval: ‘30 seconds’,
  last_ping: new Date().toISOString(),
  },
  version: ‘2.0’,
  node_version: process.version,
  });
  });

/**

- Root endpoint
- GET /
  */
  app.get(’/’, (req, res) => {
  res.sendFile(path.join(__dirname, ‘index.html’));
  });

/**

- Server stats (for monitoring)
- GET /api/stats
  */
  app.get(’/api/stats’, (req, res) => {
  const stats = {
  timestamp: Date.now(),
  server: {
  uptime: Math.floor((Date.now() - serverStartTime) / 1000),
  memory: process.memoryUsage(),
  platform: process.platform,
  node_version: process.version,
  },
  peers: {
  total: peers.size,
  by_group: {},
  },
  groups: {
  total: groups.size,
  list: Array.from(groups.keys()),
  },
  };
  
  groups.forEach((groupSet, groupId) => {
  stats.peers.by_group[groupId] = groupSet.size;
  });
  
  res.json(stats);
  });

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
console.error(‘Error:’, err);
res.status(500).json({ error: ‘Internal server error’ });
});

// ============================================================================
// CLEANUP INTERVAL
// ============================================================================

/**

- Remove peers that haven’t checked in (older than 5 minutes)
- Run every 30 seconds
  */
  setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  let removed = 0;
  
  for (const [peerId, peer] of peers) {
  if (now - peer.timestamp > timeout) {
  const group = groups.get(peer.groupId);
  if (group) group.delete(peerId);
  peers.delete(peerId);
  removed++;
  }
  }
  
  if (removed > 0) {
  console.log(`🗑️  Cleaned up ${removed} inactive peer(s)`);
  }
  }, 30000);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatUptime(seconds) {
const hours = Math.floor(seconds / 3600);
const minutes = Math.floor((seconds % 3600) / 60);
const secs = seconds % 60;

```
if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
} else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
} else {
    return `${secs}s`;
}
```

}

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;
const serverStartTime = Date.now();

server.listen(PORT, () => {
console.log(`╔════════════════════════════════════════════════════════════╗ ║              🎧 VoiceChat Signaling Server v2.0            ║ ╠════════════════════════════════════════════════════════════╣ ║                                                            ║ ║  Server:        STARTED ✅                                 ║ ║  Port:          ${PORT} ║  Environment:   ${process.env.NODE_ENV || 'development'} ║  Platform:      ${process.platform} ║                                                            ║ ║  Endpoints:                                                ║ ║  • GET  /health           (Health check + Keep-Alive)     ║ ║  • GET  /api/stats        (Server statistics)             ║ ║  • POST /api/peers/register (Register peer)               ║ ║  • GET  /api/groups/:id/peers (Get group peers)           ║ ║  • DELETE /api/peers/:id  (Remove peer)                   ║ ║                                                            ║ ║  Deployment:                                               ║ ║  • Render:  https://render.com                            ║ ║  • Heroku:  heroku create voicechat-server                ║ ║  • Replit:  https://replit.com                            ║ ║                                                            ║ ╚════════════════════════════════════════════════════════════╝`);

```
// Start keep-alive pinging
startKeepAlive();
```

});

// Graceful shutdown
process.on(‘SIGINT’, () => {
console.log(’\n\n🛑 Shutting down gracefully…’);
server.close(() => {
console.log(‘✅ Server closed’);
process.exit(0);
});

```
// Force exit after 10 seconds
setTimeout(() => {
    console.log('⚠️  Forced exit');
    process.exit(1);
}, 10000);
```

});

// Handle uncaught exceptions
process.on(‘uncaughtException’, (err) => {
console.error(‘❌ Uncaught Exception:’, err);
process.exit(1);
});

process.on(‘unhandledRejection’, (reason, promise) => {
console.error(‘❌ Unhandled Rejection at:’, promise, ‘reason:’, reason);
process.exit(1);
});

// ============================================================================
// PACKAGE.JSON (reference)
// ============================================================================
/*
{
“name”: “voicechat-server”,
“version”: “2.0.0”,
“description”: “VoiceChat P2P Signaling Server with Keep-Alive”,
“main”: “server.js”,
“scripts”: {
“start”: “node server.js”,
“dev”: “nodemon server.js”
},
“dependencies”: {
“express”: “^4.18.2”,
“cors”: “^2.8.5”
},
“devDependencies”: {
“nodemon”: “^3.0.1”
},
“engines”: {
“node”: “18.x”
}
}

INSTALLATION:
npm init -y
npm install express cors
node server.js

DEPLOYMENT TO RENDER.COM:

1. Create account at render.com
1. Connect GitHub repository
1. Create new Web Service
1. Environment: Node
1. Build command: npm install
1. Start command: node server.js
1. Add Environment Variable:
   PORT=3000
   NODE_ENV=production
1. Deploy!

Server will automatically:

- Keep itself awake with 30-second pings
- Monitor peer connections
- Clean up inactive peers
- Provide health statistics

MONITORING:
Visit: https://your-server.onrender.com/api/stats
Get real-time server statistics and peer information

KEEP-ALIVE DETAILS:

- Pings every 30 seconds
- Uses /health endpoint
- No extra external dependencies
- Works on Render, Heroku, Replit
- Automatic recovery on ping failure
  */
