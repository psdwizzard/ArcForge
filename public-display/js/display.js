document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('display-status');
  const canvas = document.getElementById('display-canvas');
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;

  const state = {
    payload: null,
    image: null,
    connected: false,
    tokenImages: {}
  };

  function setStatus(text, isConnected) {
    statusEl.textContent = text;
    statusEl.classList.toggle('connected', isConnected);
    statusEl.classList.toggle('disconnected', !isConnected);
  }

  function resizeCanvas() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = width * DPR;
    canvas.height = height * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw();
  }

  window.addEventListener('resize', resizeCanvas);

  function draw() {
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.clearRect(0, 0, width, height);

    if (!state.payload || !state.image) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.font = '24px Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting map...', width / 2, height / 2);
      return;
    }

    const fitMode = state.payload.viewport?.fit || 'fit';
    const zoom = state.payload.viewport?.zoom || 1;
    const offset = state.payload.viewport?.offset || { x: 0, y: 0 };
    const mapWidth = state.image.width;
    const mapHeight = state.image.height;
    let drawWidth = mapWidth;
    let drawHeight = mapHeight;
    let offsetX = 0;
    let offsetY = 0;
    let scale = 1;

    if (fitMode === 'fill') {
      scale = Math.max(width / mapWidth, height / mapHeight) * zoom;
      drawWidth = mapWidth * scale;
      drawHeight = mapHeight * scale;
      offsetX = (width - drawWidth) / 2 + offset.x;
      offsetY = (height - drawHeight) / 2 + offset.y;
      ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
    } else if (fitMode === 'stretch') {
      const scaleX = (width / mapWidth) * zoom;
      const scaleY = (height / mapHeight) * zoom;
      scale = scaleX; // Use scaleX for tokens
      drawWidth = mapWidth * scaleX;
      drawHeight = mapHeight * scaleY;
      offsetX = (width - drawWidth) / 2 + offset.x;
      offsetY = (height - drawHeight) / 2 + offset.y;
      ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
    } else if (fitMode === 'pixel') {
      scale = zoom;
      drawWidth = mapWidth * zoom;
      drawHeight = mapHeight * zoom;
      offsetX = (width - drawWidth) / 2 + offset.x;
      offsetY = (height - drawHeight) / 2 + offset.y;
      ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      scale = Math.min(width / mapWidth, height / mapHeight) * zoom;
      drawWidth = mapWidth * scale;
      drawHeight = mapHeight * scale;
      offsetX = (width - drawWidth) / 2 + offset.x;
      offsetY = (height - drawHeight) / 2 + offset.y;
      ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
    }

    if (state.payload.grid?.enabled && state.payload.grid?.cell_px) {
      drawGrid({
        x: offsetX,
        y: offsetY,
        width: drawWidth,
        height: drawHeight,
        scale: drawWidth / state.image.width
      });
    }

    // Draw enemy tokens
    drawTokens({
      offsetX,
      offsetY,
      scale,
      mapId: state.payload.map?.url
    });
  }

  function drawGrid(area) {
    const grid = state.payload.grid;
    const cell = grid.cell_px * (area.scale || 1);

    if (!cell || !Number.isFinite(cell)) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = grid.opacity ?? 0.25;
    ctx.strokeStyle = grid.color || '#3aaaff';
    ctx.lineWidth = grid.line_px || 2;
    ctx.beginPath();

    for (let x = area.x; x <= area.x + area.width; x += cell) {
      ctx.moveTo(x, area.y);
      ctx.lineTo(x, area.y + area.height);
    }

    for (let y = area.y; y <= area.y + area.height; y += cell) {
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.width, y);
    }

    ctx.stroke();
    ctx.restore();
  }

  function preloadTokenImage(imagePath) {
    if (!imagePath || state.tokenImages[imagePath]) {
      return;
    }

    const img = new Image();
    img.onload = () => {
      draw(); // Redraw when image loads
    };
    img.onerror = () => {
      console.warn('[Display] Failed to load token image:', imagePath);
    };
    img.src = imagePath;
    state.tokenImages[imagePath] = img;
  }

  function drawTokens(mapTransform) {
    if (!state.payload || !state.payload.tokens) {
      return;
    }

    const tokens = state.payload.tokens;
    const grid = state.payload.grid;
    const cellSize = grid?.cell_px || 50;

    tokens.forEach(token => {
      // Convert token map coordinates to screen coordinates
      const screenX = mapTransform.offsetX + (token.x * mapTransform.scale);
      const screenY = mapTransform.offsetY + (token.y * mapTransform.scale);
      const tokenRadius = (cellSize * mapTransform.scale) / 2;

      // Preload image if available
      const imagePath = token.imagePath;
      if (imagePath) {
        preloadTokenImage(imagePath);
      }

      const tokenImage = imagePath ? state.tokenImages[imagePath] : null;

      ctx.save();

      if (tokenImage && tokenImage.complete && tokenImage.naturalWidth > 0) {
        // Draw circular clipped image
        ctx.beginPath();
        ctx.arc(screenX, screenY, tokenRadius, 0, Math.PI * 2);
        ctx.clip();

        // Draw image to fill the circle
        const imgSize = tokenRadius * 2;
        ctx.drawImage(tokenImage, screenX - tokenRadius, screenY - tokenRadius, imgSize, imgSize);
        ctx.restore();

        // Draw border around the image
        ctx.save();
        ctx.beginPath();
        ctx.arc(screenX, screenY, tokenRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      } else {
        // Draw default red circle if no image
        ctx.fillStyle = 'rgba(220, 38, 38, 0.7)'; // Red color for enemies
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.arc(screenX, screenY, tokenRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Draw name label below the token
      ctx.save();
      const fontSize = Math.max(14, tokenRadius / 1.5);
      ctx.font = `bold ${fontSize}px Roboto, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Draw text with background for better visibility
      const textY = screenY + tokenRadius + 6;
      const textMetrics = ctx.measureText(token.name);
      const textWidth = textMetrics.width;
      const textHeight = fontSize + 6;

      // Draw semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(screenX - textWidth / 2 - 6, textY - 3, textWidth + 12, textHeight);

      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(token.name, screenX, textY);
      ctx.restore();
    });
  }

  function handleDisplayState(payload) {
    state.payload = payload;

    // Update map name header
    const mapNameHeader = document.getElementById('map-name-header');
    if (mapNameHeader) {
      mapNameHeader.textContent = payload?.map?.name || 'No Map Loaded';
    }

    // Update current turn footer
    const currentTurnFooter = document.getElementById('current-turn-footer');
    const currentTurnName = document.getElementById('current-turn-name');

    if (payload?.currentTurn && payload.currentTurn.visible !== false) {
      if (currentTurnFooter) currentTurnFooter.style.display = 'flex';
      if (currentTurnName) currentTurnName.textContent = payload.currentTurn.name || '—';
    } else {
      if (currentTurnFooter) currentTurnFooter.style.display = 'none';
    }

    if (!payload?.map?.url) {
      state.image = null;
      draw();
      return;
    }

    const img = new Image();
    img.onload = () => {
      state.image = img;
      draw();
    };
    img.onerror = () => {
      state.image = null;
      draw();
    };
    img.src = `${payload.map.url}?t=${Date.now()}`;
  }

  resizeCanvas();
  const socket = io('/', { path: '/socket.io' });

  socket.on('connect', () => {
    state.connected = true;
    setStatus('Display connected', true);
    // Use screen dimensions instead of window dimensions for accurate resolution
    // This gives the actual monitor resolution, not just the browser window size
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    console.log('[Display] Reporting resolution:', screenWidth, 'x', screenHeight);
    console.log('[Display] Window size:', window.innerWidth, 'x', window.innerHeight);
    socket.emit('display:hello', {
      role: 'display',
      resolution: { w: screenWidth, h: screenHeight }
    });
  });

  socket.on('disconnect', () => {
    state.connected = false;
    setStatus('Display not connected', false);
  });

  socket.on('display:state', (payload) => {
    handleDisplayState(payload);
  });
});
