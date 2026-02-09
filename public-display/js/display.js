document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('display-status');
  const statusTextEl = statusEl ? statusEl.querySelector('.status-text') : null;
  const canvas = document.getElementById('display-canvas');
  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  const initiativeRail = document.getElementById('initiative-rail');

  const state = {
    payload: null,
    image: null,
    connected: false,
    tokenImages: {},
    flavorMediaImage: null,
    lastTokenHpByKey: {},
    combatTextEffects: [],
    combatTextAnimationFrame: null,
    tokenShakeByKey: {}
  };

  function getTokenKey(token) {
    if (!token || typeof token !== 'object') {
      return null;
    }
    return token.id || token.atlasTokenId || token.combatantId || null;
  }

  function queueDamageTextEffects(payload) {
    const tokens = Array.isArray(payload?.tokens) ? payload.tokens : [];
    const nextHpByKey = {};
    const hadPrevious = Object.keys(state.lastTokenHpByKey || {}).length > 0;

    tokens.forEach((token) => {
      const key = getTokenKey(token);
      const hpCurrent = Number(token?.hpCurrent);
      if (!key || !Number.isFinite(hpCurrent)) {
        return;
      }

      const previousHp = Number(state.lastTokenHpByKey[key]);
      if (hadPrevious && Number.isFinite(previousHp) && hpCurrent !== previousHp) {
        const now = performance.now();
        const delta = Math.round(hpCurrent - previousHp);

        if (delta < 0) {
          const damage = Math.max(0, Math.abs(delta));
          if (damage > 0) {
            const hpMax = Number(token?.hpMax);
            const critThreshold = Number.isFinite(hpMax) && hpMax > 0
              ? Math.max(10, Math.ceil(hpMax * 0.2))
              : 10;
            const isCrit = damage >= critThreshold;

            state.combatTextEffects.push({
              id: `dmg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              tokenKey: key,
              text: isCrit ? `CRIT! -${damage}` : `-${damage}`,
              kind: 'damage',
              isCrit,
              createdAt: now,
              durationMs: isCrit ? 1100 : 900,
              driftX: (Math.random() - 0.5) * 20
            });

            state.tokenShakeByKey[key] = {
              createdAt: now,
              durationMs: isCrit ? 420 : 300,
              strength: isCrit ? 8 : 5
            };
          }
        } else if (delta > 0) {
          const heal = Math.max(0, delta);
          state.combatTextEffects.push({
            id: `heal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            tokenKey: key,
            text: `+${heal}`,
            kind: 'heal',
            isCrit: false,
            createdAt: now,
            durationMs: 900,
            driftX: (Math.random() - 0.5) * 16
          });
        }
      }

      nextHpByKey[key] = hpCurrent;
    });

    state.lastTokenHpByKey = nextHpByKey;

    if (state.combatTextEffects.length > 0 || Object.keys(state.tokenShakeByKey).length > 0) {
      startCombatTextAnimationLoop();
    }
  }

  function startCombatTextAnimationLoop() {
    if (state.combatTextAnimationFrame) {
      return;
    }

    const tick = () => {
      state.combatTextAnimationFrame = null;
      const now = performance.now();
      state.combatTextEffects = state.combatTextEffects.filter((effect) => {
        const age = now - effect.createdAt;
        return age < effect.durationMs;
      });
      const nextShakeByKey = {};
      Object.keys(state.tokenShakeByKey).forEach((key) => {
        const shake = state.tokenShakeByKey[key];
        if (!shake) return;
        if ((now - shake.createdAt) < shake.durationMs) {
          nextShakeByKey[key] = shake;
        }
      });
      state.tokenShakeByKey = nextShakeByKey;

      draw();

      if (state.combatTextEffects.length > 0 || Object.keys(state.tokenShakeByKey).length > 0) {
        state.combatTextAnimationFrame = requestAnimationFrame(tick);
      }
    };

    state.combatTextAnimationFrame = requestAnimationFrame(tick);
  }

  function setStatus(text, isConnected) {
    if (statusTextEl) {
      statusTextEl.textContent = text;
    }
    if (statusEl) {
      statusEl.setAttribute('aria-label', text);
      statusEl.classList.toggle('connected', Boolean(isConnected));
      statusEl.classList.toggle('disconnected', !isConnected);
    }
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

  function getInitialLetter(name) {
    if (!name || typeof name !== 'string') {
      return '?';
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return '?';
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function renderInitiativeRail(payload) {
    if (!initiativeRail) {
      return;
    }

    const entries = Array.isArray(payload?.initiativeOrder) ? payload.initiativeOrder : [];
    if (!entries.length) {
      initiativeRail.classList.add('hidden');
      initiativeRail.setAttribute('aria-hidden', 'true');
      initiativeRail.replaceChildren();
      return;
    }

    const total = entries.length;
    const fragment = document.createDocumentFragment();

    entries.forEach((entry, index) => {
      const slot = document.createElement('div');
      slot.className = 'initiative-slot';
      slot.setAttribute('role', 'listitem');
      slot.setAttribute('aria-label', `${entry?.name || 'Combatant'} (${index + 1} of ${total})`);
      slot.title = entry?.name || 'Unknown combatant';

      if (entry?.isEnemy) {
        slot.classList.add('initiative-slot--enemy');
      } else {
        slot.classList.add('initiative-slot--ally');
      }
      if (entry?.isCurrent) {
        slot.classList.add('initiative-slot--current');
      }
      if (entry?.isDead) {
        slot.classList.add('initiative-slot--dead');
      }
      if (entry?.isVisible === false) {
        slot.classList.add('initiative-slot--dim');
      }

      const avatar = document.createElement('div');
      avatar.className = 'initiative-avatar';

      const appendFallback = () => {
        avatar.innerHTML = '';
        const fallback = document.createElement('div');
        fallback.className = 'initiative-fallback';
        fallback.textContent = getInitialLetter(entry?.name);
        avatar.appendChild(fallback);
      };

      if (entry?.imagePath) {
        const img = new Image();
        img.src = entry.imagePath;
        img.alt = entry?.name || 'Combatant token';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', appendFallback, { once: true });
        avatar.appendChild(img);
      } else {
        appendFallback();
      }

      slot.appendChild(avatar);
      fragment.appendChild(slot);
    });

    initiativeRail.setAttribute('aria-hidden', 'false');
    initiativeRail.classList.remove('hidden');
    initiativeRail.replaceChildren(fragment);
  }

  function applyDisplayRotation(payload) {
    const rotation = Number(payload?.rotation) === 180 ? 180 : 0;
    document.body.classList.toggle('display-rotated', rotation === 180);
  }

  function draw() {
    const width = canvas.width / DPR;
    const height = canvas.height / DPR;
    ctx.clearRect(0, 0, width, height);

    // If no payload at all, show awaiting message
    if (!state.payload) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.font = '24px Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting map...', width / 2, height / 2);
      return;
    }

    // If no map but we have flavor media, skip to flavor media (no return here)
    if (!state.image && !state.payload.flavorMedia) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.font = '24px Roboto, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting map...', width / 2, height / 2);
      return;
    }

    // Draw map if we have one
    if (state.image) {

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
    } // End of if (state.image) block

    // Draw flavor media overlay if present (works with or without map)
    if (state.payload.flavorMedia) {
      drawFlavorMediaOverlay(width, height);
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

  function getHealthRingColor(percent) {
    if (!Number.isFinite(percent)) {
      return 'rgba(220, 38, 38, 0.9)';
    }
    if (percent <= 0) {
      return '#6b7280';
    }
    if (percent <= 25) {
      return '#ef4444';
    }
    if (percent <= 50) {
      return '#f97316';
    }
    if (percent <= 75) {
      return '#facc15';
    }
    return '#22c55e';
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
    const activeTokenId = state.payload?.currentTurn?.tokenId || state.payload?.currentTurn?.atlasTokenId || null;
    const activeCombatantId = state.payload?.currentTurn?.combatantId || null;
    const showHealthRings = state.payload?.tokenSettings?.showEnemyHealthColors !== false;

    tokens.forEach(token => {
      let screenX = mapTransform.offsetX + (token.x * mapTransform.scale);
      let screenY = mapTransform.offsetY + (token.y * mapTransform.scale);

      let tokenRadius = (cellSize * mapTransform.scale) / 2;
      tokenRadius = Math.max(tokenRadius, 25);
      const tokenKey = getTokenKey(token);
      const shake = tokenKey ? state.tokenShakeByKey[tokenKey] : null;
      if (shake) {
        const now = performance.now();
        const age = now - shake.createdAt;
        const progress = Math.max(0, Math.min(1, age / shake.durationMs));
        const envelope = 1 - progress;
        const jitterX = (Math.random() - 0.5) * shake.strength * 2 * envelope;
        const jitterY = (Math.random() - 0.5) * shake.strength * 2 * envelope;
        screenX += jitterX;
        screenY += jitterY;
      }

      const basePercent = Number.isFinite(token.hpPercent)
        ? token.hpPercent
        : (Number.isFinite(token.hpCurrent) && Number.isFinite(token.hpMax) && token.hpMax > 0
            ? Math.round((token.hpCurrent / token.hpMax) * 100)
            : null);
      const clampedPercent = Number.isFinite(basePercent) ? Math.max(0, Math.min(100, basePercent)) : null;
      const defaultRingColor = 'rgba(220, 38, 38, 0.9)';
      const isDead = token.isDead === true;
      const ringColor = showHealthRings
        ? (isDead
            ? getHealthRingColor(0)
            : (clampedPercent !== null ? getHealthRingColor(clampedPercent) : defaultRingColor))
        : defaultRingColor;
      const ringLineWidth = Math.max(4, tokenRadius * 0.18);

      const isActiveToken = (Boolean(activeTokenId) && (token.id === activeTokenId || token.atlasTokenId === activeTokenId))
        || (Boolean(activeCombatantId) && token.combatantId === activeCombatantId);
      if (isActiveToken) {
        ctx.save();
        const glowRadius = tokenRadius + Math.max(10, tokenRadius * 0.25);
        ctx.beginPath();
        ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = Math.max(6, tokenRadius * 0.18);
        ctx.shadowColor = 'rgba(255, 255, 255, 0.75)';
        ctx.shadowBlur = Math.max(18, tokenRadius * 0.6);
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.restore();
      }

      console.log('[Display] Drawing token:', token.name, 'at', screenX, screenY, 'radius:', tokenRadius, 'hp%', clampedPercent);

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
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = ringLineWidth;
        ctx.stroke();
        ctx.restore();
      } else {
        // Draw default red circle if no image - BRIGHT and SOLID for visibility
        ctx.fillStyle = '#dc2626'; // Solid bright red (no transparency)
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = Math.max(ringLineWidth, 5);

        ctx.beginPath();
        ctx.arc(screenX, screenY, tokenRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Draw name label below the token
      ctx.save();
      const fontSize = Math.max(18, tokenRadius / 1.2); // Larger minimum font size
      ctx.font = `bold ${fontSize}px Roboto, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Draw text with background for better visibility
      const textY = screenY + tokenRadius + 8;
      const textMetrics = ctx.measureText(token.name);
      const textWidth = textMetrics.width;
      const textHeight = fontSize + 8;

      // Draw semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; // Slightly more opaque
      ctx.fillRect(screenX - textWidth / 2 - 8, textY - 4, textWidth + 16, textHeight);

      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(token.name, screenX, textY);
      ctx.restore();
    });

    drawFloatingCombatText(mapTransform, tokens);
  }

  function drawFloatingCombatText(mapTransform, tokens) {
    if (!state.combatTextEffects.length) {
      return;
    }

    const tokenByKey = {};
    tokens.forEach((token) => {
      const key = getTokenKey(token);
      if (key) {
        tokenByKey[key] = token;
      }
    });

    const now = performance.now();
    state.combatTextEffects.forEach((effect) => {
      const token = tokenByKey[effect.tokenKey];
      if (!token) {
        return;
      }

      const age = now - effect.createdAt;
      const progress = Math.max(0, Math.min(1, age / effect.durationMs));
      const alpha = 1 - progress;
      const rise = 16 + (progress * 52);

      const x = mapTransform.offsetX + (token.x * mapTransform.scale) + effect.driftX;
      const y = mapTransform.offsetY + (token.y * mapTransform.scale) - rise;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = effect.isCrit ? 'bold 46px "Courier New", monospace' : 'bold 42px "Courier New", monospace';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.lineWidth = 8;
      ctx.strokeText(effect.text, x, y);
      ctx.fillStyle = effect.kind === 'heal' ? '#34d399' : (effect.isCrit ? '#facc15' : '#ff3b30');
      ctx.fillText(effect.text, x, y);
      ctx.restore();
    });
  }

  function drawFlavorMediaOverlay(width, height) {
    if (!state.payload.flavorMedia) {
      return;
    }

    console.log('[Display] Drawing flavor media overlay:', state.payload.flavorMedia);

    const imagePath = state.payload.flavorMedia.imagePath;
    console.log('[Display] Flavor media image path:', imagePath);
    console.log('[Display] Current location:', window.location.href);

    // Preload flavor media image if not already loaded
    // Convert both to absolute URLs for comparison
    const absoluteImagePath = new URL(imagePath, window.location.href).href;
    const currentImageSrc = state.flavorMediaImage ? new URL(state.flavorMediaImage.src, window.location.href).href : null;

    console.log('[Display] Absolute image path:', absoluteImagePath);
    console.log('[Display] Current image src:', currentImageSrc);

    if (!state.flavorMediaImage || currentImageSrc !== absoluteImagePath) {
      const img = new Image();
      img.onload = () => {
        console.log('[Display] Flavor media image loaded successfully!');
        state.flavorMediaImage = img;
        draw(); // Redraw when image loads
      };
      img.onerror = (error) => {
        console.error('[Display] Failed to load flavor media:', imagePath);
        console.error('[Display] Image error event:', error);
        console.error('[Display] Attempted URL:', img.src);
        state.flavorMediaImage = null;
      };
      console.log('[Display] Attempting to load flavor media from:', imagePath);
      img.src = imagePath;
      return; // Wait for image to load
    }

    console.log('[Display] Image already loaded, proceeding to draw');

    // Draw semi-transparent black background
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, width, height);

    // Draw the flavor media image centered
    const img = state.flavorMediaImage;
    if (img.complete && img.naturalWidth > 0) {
      // Calculate scaling to fit the image on screen while maintaining aspect ratio
      const imgAspect = img.width / img.height;
      const screenAspect = width / height;

      let drawWidth, drawHeight, drawX, drawY;

      if (imgAspect > screenAspect) {
        // Image is wider than screen
        drawWidth = width * 0.9; // Use 90% of screen width
        drawHeight = drawWidth / imgAspect;
      } else {
        // Image is taller than screen
        drawHeight = height * 0.9; // Use 90% of screen height
        drawWidth = drawHeight * imgAspect;
      }

      drawX = (width - drawWidth) / 2;
      drawY = (height - drawHeight) / 2;

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    }

    ctx.restore();
  }

  function handleDisplayState(payload) {
    const previousMapUrl = state.payload?.map?.url;
    const mapChanged = previousMapUrl !== payload?.map?.url;
    state.payload = payload;
    applyDisplayRotation(payload);
    if (mapChanged) {
      state.lastTokenHpByKey = {};
      state.combatTextEffects = [];
      state.tokenShakeByKey = {};
    }
    queueDamageTextEffects(payload);

    console.log('[Display] Received state update, flavorMedia:', payload?.flavorMedia);

    // Update map name header
    const mapNameHeader = document.getElementById('map-name-header');
    if (mapNameHeader) {
      mapNameHeader.textContent = payload?.map?.name || 'No Map Loaded';
    }

    // Update current turn banner
    const currentTurnBanner = document.getElementById('current-turn-banner');
    const currentTurnName = document.getElementById('current-turn-name');

    if (payload?.currentTurn && payload.currentTurn.visible !== false) {
      if (currentTurnBanner) currentTurnBanner.style.display = 'flex';
      if (currentTurnName) currentTurnName.textContent = payload.currentTurn.name || '\\u2014';
    } else {
      if (currentTurnBanner) currentTurnBanner.style.display = 'none';
    }

    renderInitiativeRail(payload);

    if (!payload?.map?.url) {
      state.image = null;
      draw();
      return;
    }

    // If map hasn't changed, just redraw with new viewport/grid settings
    if (previousMapUrl === payload.map.url && state.image) {
      draw();
      return;
    }

    // Load new map image
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

  socket.on('settings:ui-scale', (payload) => {
    if (payload && payload.scale) {
        document.documentElement.style.fontSize = `${payload.scale}%`;
    }
  });
});
