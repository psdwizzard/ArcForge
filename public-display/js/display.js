document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('display-status');
  const canvas = document.getElementById('display-canvas');
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;

  const state = {
    payload: null,
    image: null,
    connected: false
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

    if (fitMode === 'fill') {
      const scale = Math.max(width / mapWidth, height / mapHeight) * zoom;
      drawWidth = mapWidth * scale;
      drawHeight = mapHeight * scale;
      offsetX = (width - drawWidth) / 2 + offset.x;
      offsetY = (height - drawHeight) / 2 + offset.y;
      ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
    } else if (fitMode === 'stretch') {
      const scaleX = (width / mapWidth) * zoom;
      const scaleY = (height / mapHeight) * zoom;
      drawWidth = mapWidth * scaleX;
      drawHeight = mapHeight * scaleY;
      offsetX = (width - drawWidth) / 2 + offset.x;
      offsetY = (height - drawHeight) / 2 + offset.y;
      ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
    } else if (fitMode === 'pixel') {
      drawWidth = mapWidth * zoom;
      drawHeight = mapHeight * zoom;
      offsetX = (width - drawWidth) / 2 + offset.x;
      offsetY = (height - drawHeight) / 2 + offset.y;
      ctx.drawImage(state.image, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      const scale = Math.min(width / mapWidth, height / mapHeight) * zoom;
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

  function handleDisplayState(payload) {
    state.payload = payload;
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
