import { useState, useRef, useCallback, useEffect } from 'react';
import { initNetworkTables, publishTarget, subscribeToAlliance, subscribeToRobotPose, onConnectionChange, getActiveServer } from '../networktables';
import './App.css';

const FIELD = {
  X: 651.2,
  Y: 317.7,
};

// Define preset zones for each alliance
// Red team starts on the left side (X = 0)
// Blue team starts on the right side (X = 651.2)
const ZONES = {
  red: {
    LEFT: { x: 563, y: 60.8, label: 'LEFT ZONE' },       // Left side from driver perspective
    MIDDLE: { x: 556.8, y: 159, label: 'MIDDLE ZONE' },  // Center
    RIGHT: { x: 555.4, y: 259, label: 'RIGHT ZONE' },    // Right side from driver perspective
  },
  blue: {
    LEFT: { x: 95, y: 263, label: 'LEFT ZONE' },         // Left side from driver perspective
    MIDDLE: { x: 96.5, y: 159, label: 'MIDDLE ZONE' },  // Center (same)
    RIGHT: { x: 93, y: 57, label: 'RIGHT ZONE' },       // Right side from driver perspective
  },
};

function App() {
  const [ntStatus, setNtStatus] = useState({ connected: false, ip: '', mode: '' });
  const [hudOpen, setHudOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alliance, setAlliance] = useState('red');
  const [targets, setTargets] = useState([]);
  const [mousePos, setMousePos] = useState(null);
  const [hoveredDot, setHoveredDot] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [fieldRotation, setFieldRotation] = useState('vertical');
  const [imageLoaded, setImageLoaded] = useState(false);

  const [robotPose, setRobotPose] = useState({ x: 5, y: 5, rotation: -Math.PI / 2 });

  const fieldRef = useRef(null);
  const isDraggingRef = useRef(false);
  const isManualOverrideRef = useRef(false);
  const isTouchActiveRef = useRef(false);

  const GRID_SPACING = 28;
  const [gridDots, setGridDots] = useState([]);

  // ALL UPDATES IN 4 EFFECTS
  useEffect(() => {
    onConnectionChange((connected) => {
      setNtStatus(prev => ({ ...prev, connected }));

      if (connected) {
        setTargets([]);
      }
    });

    initNetworkTables().then((robotConnected) => {
      const server = getActiveServer();
      setNtStatus(prev => ({
        ...prev,
        ip: server,
        connected: robotConnected,
        mode: robotConnected ? 'ROBOT' : 'SIM',
      }));

      // Subscribe to topics — they'll start working once the client connects
      subscribeToAlliance((color) => {
        if (color === 'red' || color === 'blue') setAlliance(color);
      });
      subscribeToRobotPose((pose) => {
        setRobotPose(pose);
      });
    }).catch((err) => {
      console.warn('initNetworkTables failed:', err);
    });
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (!fieldRef.current) return;
      const rect = fieldRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Compute actual visible image bounds, accounting for object-fit: contain letterboxing
  const getImageBounds = useCallback(() => {
    const img = fieldRef.current?.querySelector('img');
    const container = fieldRef.current;
    if (!img || !container) return null;

    const imgRect = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (fieldRotation === 'horizontal') {
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      if (!naturalW || !naturalH) return null;

      const aspectRatio = naturalW / naturalH;
      const boxW = imgRect.width;
      const boxH = imgRect.height;
      const boxAspect = boxW / boxH;

      let contentW, contentH;
      if (boxAspect > aspectRatio) {
        contentH = boxH;
        contentW = boxH * aspectRatio;
      } else {
        contentW = boxW;
        contentH = boxW / aspectRatio;
      }

      const contentLeft = (imgRect.left - containerRect.left) + (boxW - contentW) / 2;
      const contentTop = (imgRect.top - containerRect.top) + (boxH - contentH) / 2;

      return { left: contentLeft, top: contentTop, width: contentW, height: contentH };
    } else {
      return {
        left: imgRect.left - containerRect.left,
        top: imgRect.top - containerRect.top,
        width: imgRect.width,
        height: imgRect.height,
      };
    }
  }, [fieldRotation]);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;
    if (!imageLoaded) return;

    // Small delay to ensure CSS transforms have applied
    const timeout = setTimeout(() => {
      const bounds = getImageBounds();
      if (!bounds) return;

      const imgLeft = bounds.left;
      const imgTop = bounds.top;
      const imgRight = imgLeft + bounds.width;
      const imgBottom = imgTop + bounds.height;

      const dots = [];
      for (let x = GRID_SPACING; x < dimensions.width; x += GRID_SPACING) {
        for (let y = GRID_SPACING; y < dimensions.height; y += GRID_SPACING) {
          if (x > imgLeft && x < imgRight && y > imgTop && y < imgBottom) {
            dots.push({ x, y });
          }
        }
      }
      setGridDots(dots);
    }, 50);

    return () => clearTimeout(timeout);
  }, [dimensions, alliance, fieldRotation, imageLoaded, getImageBounds]);


  // Convert screen coordinates to field coordinates based on alliance and rotation
  const screenToField = useCallback((screenX, screenY) => {
    const img = fieldRef.current?.querySelector('img');
    if (!img) return { x: 0, y: 0 };

    const imgRect = img.getBoundingClientRect();
    const containerRect = fieldRef.current.getBoundingClientRect();

    const imgLeft = imgRect.left - containerRect.left;
    const imgTop = imgRect.top - containerRect.top;

    const relX = (screenX - imgLeft) / imgRect.width;
    const relY = (screenY - imgTop) / imgRect.height;

    let fieldX, fieldY;

    if (fieldRotation === 'horizontal') {
      if (alliance === 'blue') {
        fieldX = (1 - relX) * FIELD.X;
        fieldY = (1 - relY) * FIELD.Y;
      } else {
        fieldX = relX * FIELD.X;
        fieldY = (1 - relY) * FIELD.Y;
      }
    } else {
      if (alliance === 'blue') {
        fieldX = (1 - relY) * FIELD.X;
        fieldY = relX * FIELD.Y;
      } else {
        fieldX = relY * FIELD.X;
        fieldY = relX * FIELD.Y;
      }
    }

    return {
      x: parseFloat(fieldX.toFixed(2)),
      y: parseFloat(fieldY.toFixed(2))
    };
  }, [alliance, fieldRotation]);

  // Convert field coordinates back to screen position for rendering targets
  const fieldToScreen = useCallback((fieldX, fieldY) => {
    const img = fieldRef.current?.querySelector('img');
    if (!img) return { x: 0, y: 0 };

    const imgRect = img.getBoundingClientRect();
    const containerRect = fieldRef.current.getBoundingClientRect();

    const imgLeft = imgRect.left - containerRect.left;
    const imgTop = imgRect.top - containerRect.top;

    let relX, relY;

    if (fieldRotation === 'horizontal') {
      if (alliance === 'blue') {
        relX = 1 - fieldX / FIELD.X;
        relY = 1 - fieldY / FIELD.Y;
      } else {
        relX = fieldX / FIELD.X;
        relY = 1 - fieldY / FIELD.Y;
      }
    } else {
      // Vertical
      if (alliance === 'blue') {
        relX = fieldY / FIELD.Y;
        relY = 1 - fieldX / FIELD.X;
      } else {
        relX = fieldY / FIELD.Y;
        relY = fieldX / FIELD.X;
      }
    }

    return {
      x: relX * imgRect.width + imgLeft,
      y: relY * imgRect.height + imgTop,
    };
  }, [alliance, fieldRotation]);


  const setTargetFromScreen = useCallback((screenX, screenY) => {
    if (!fieldRef.current) return false;

    const bounds = getImageBounds();
    if (!bounds) return false;

    const imgLeft = bounds.left;
    const imgTop = bounds.top;
    const imgRight = imgLeft + bounds.width;
    const imgBottom = imgTop + bounds.height;

    if (screenX < imgLeft || screenX > imgRight || screenY < imgTop || screenY > imgBottom) {
      return false;
    }

    const fieldCoords = screenToField(screenX, screenY);
    if (fieldCoords.x < 0 || fieldCoords.x > FIELD.X || fieldCoords.y < 0 || fieldCoords.y > FIELD.Y) {
      return false;
    }

    const newTarget = {
      id: `target-${Date.now()}`,
      fieldX: fieldCoords.x,
      fieldY: fieldCoords.y,
      timestamp: Date.now(),
    };

    if (ntStatus.connected) {
      publishTarget({ x: fieldCoords.x, y: fieldCoords.y });
    }

    setTargets([newTarget]);
    return true;
  }, [screenToField, ntStatus.connected, getImageBounds]);

  const handleFieldPointerDown = useCallback((e) => {
    if (e.pointerType === 'touch') return;
    if (!fieldRef.current || e.button !== 0) return;
    if (e.target.closest('.hud')) return;

    fieldRef.current.setPointerCapture(e.pointerId);
    const rect = fieldRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    isDraggingRef.current = setTargetFromScreen(screenX, screenY);
  }, [setTargetFromScreen]);

  const handleTouchStart = useCallback((e) => {
    if (!fieldRef.current) return;
    if (e.target.closest('.hud')) return;

    isTouchActiveRef.current = true;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = fieldRef.current.getBoundingClientRect();
    const screenX = touch.clientX - rect.left;
    const screenY = touch.clientY - rect.top;
    isDraggingRef.current = setTargetFromScreen(screenX, screenY);
    setMousePos({ x: screenX, y: screenY });
  }, [setTargetFromScreen]);

  const handleTouchMove = useCallback((e) => {
    if (!fieldRef.current) return;

    e.preventDefault();
    const touch = e.touches[0];
    const rect = fieldRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    setMousePos({ x, y });
    if (isDraggingRef.current) {
      setTargetFromScreen(x, y);
    }

    let nearestDot = null;
    let minDist = GRID_SPACING;
    gridDots.forEach(dot => {
      const dist = Math.sqrt((dot.x - x) ** 2 + (dot.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearestDot = { x: dot.x, y: dot.y };
      }
    });
    setHoveredDot(nearestDot);
  }, [gridDots, setTargetFromScreen]);

  const handleTouchEnd = useCallback(() => {
    isTouchActiveRef.current = false;
    isDraggingRef.current = false;
    isManualOverrideRef.current = false;
    setTargets([]);
    setMousePos(null);
    setHoveredDot(null);
  }, []);

  // Handle preset zone buttons - gets current alliance's zones
  const handleZoneClick = useCallback((zone) => {
    isManualOverrideRef.current = true;
    const fieldCoords = zone;

    const newTarget = {
      id: `target-${Date.now()}`,
      fieldX: fieldCoords.x,
      fieldY: fieldCoords.y,
      timestamp: Date.now(),
    };

    if (ntStatus.connected) {
      publishTarget({ x: fieldCoords.x, y: fieldCoords.y });
    }

    setTargets([newTarget]);
  }, [ntStatus.connected]);

  // Handle clear target button — reverts to auto-aim
  const handleClearTarget = useCallback(() => {
    isManualOverrideRef.current = false;
    setTargets([]);
  }, []);

  // Handle pointer movement to find nearest grid dot and calculate dynamic styles
  const handlePointerMove = useCallback((e) => {
    if (e.pointerType === 'touch' || isTouchActiveRef.current) return;
    if (!fieldRef.current) return;

    const rect = fieldRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });
    if (isDraggingRef.current) {
      setTargetFromScreen(x, y);
    }

    let nearestDot = null;
    let minDist = GRID_SPACING;

    gridDots.forEach(dot => {
      const dist = Math.sqrt((dot.x - x) ** 2 + (dot.y - y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        nearestDot = { x: dot.x, y: dot.y };
      }
    });

    setHoveredDot(nearestDot);
  }, [gridDots, setTargetFromScreen]);

  const handlePointerUp = useCallback((e) => {
    if (e.pointerType === 'touch') return;
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      isManualOverrideRef.current = false;
      setTargets([]);
    }
  }, []);

  // Calculate dynamic styles for grid dots based on mouse and target proximity
  const getDotStyle = (dot) => {
    let offsetX = 0;
    let offsetY = 0;
    let opacity = 0.35;

    const maxDist = 80;
    const maxDisplacement = 12;

    if (mousePos) {
      const dx = dot.x - mousePos.x;
      const dy = dot.y - mousePos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < maxDist && dist > 0) {
        const strength = 1 - (dist / maxDist);
        offsetX += (dx / dist) * maxDisplacement * strength;
        offsetY += (dy / dist) * maxDisplacement * strength;
        opacity = 0.35 + (strength * 0.5);
      }
    }

    if (targets.length > 0) {
      const target = targets[0];
      const targetScreen = fieldToScreen(target.fieldX, target.fieldY);
      const dx = dot.x - targetScreen.x;
      const dy = dot.y - targetScreen.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const targetMaxDist = 80;
      const targetDisplacement = 20;

      if (dist < targetMaxDist && dist > 0) {
        const strength = 1 - (dist / targetMaxDist);
        offsetX += (dx / dist) * targetDisplacement * strength;
        offsetY += (dy / dist) * targetDisplacement * strength;
      }
    }

    return {
      opacity,
      transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
    };
  };

  const getRobotScreenPosition = useCallback(() => {
    const screenPos = fieldToScreen(robotPose.x, robotPose.y);

    let screenRotation;

    // WPILib: 0 rad = facing positive X (toward red wall), CCW positive

    if (fieldRotation === 'horizontal') {
      if (alliance === 'blue') {
        screenRotation = -robotPose.rotation + Math.PI * 1.5;
      } else {
        screenRotation = -robotPose.rotation + Math.PI / 2;
      }
    } else {
      if (alliance === 'blue') {
        screenRotation = -robotPose.rotation;
      } else {
        screenRotation = -robotPose.rotation + Math.PI;
      }
    }

    return {
      x: screenPos.x,
      y: screenPos.y,
      rotation: screenRotation,
    };
  }, [robotPose, fieldToScreen, fieldRotation, alliance]);

  // Get zones for current alliance
  const currentZones = ZONES[alliance];

  return (
    <div className={`app ${alliance}`}>
      <div
        ref={fieldRef}
        className="field"
        onPointerDown={handleFieldPointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          if (isTouchActiveRef.current) return;
          setMousePos(null);
          setHoveredDot(null);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src="/2026RebuiltField.png"
          alt="Field"
          className={`field-image ${alliance} ${fieldRotation}`}
          onLoad={() => setImageLoaded(true)}
        />

        {(() => {
          const bounds = getImageBounds();
          if (!bounds) return null;
          return (
            <div
              className="field-border"
              style={{
                left: bounds.left,
                top: bounds.top,
                width: bounds.width,
                height: bounds.height,
              }}
            />
          );
        })()}

        <div className="grid-overlay">
          {gridDots.map((dot, i) => (
            <div
              key={`${i}-${targets[0]?.id || 'none'}`}
              className={`grid-dot ${hoveredDot?.x === dot.x && hoveredDot?.y === dot.y ? 'hovered' : ''}`}
              style={{
                left: dot.x,
                top: dot.y,
                ...getDotStyle(dot),
              }}
            />
          ))}
        </div>

        {targets.map((target, index) => {
          const screenPos = fieldToScreen(target.fieldX, target.fieldY);
          return (
            <div
              key={`${target.id}-${dimensions.width}`}
              className="target"
              style={{
                left: screenPos.x,
                top: screenPos.y,
                zIndex: 100 + index,
              }}
            >
              <div className="target-ring ring-1" />
              <div className="target-ring ring-2" />
              <div className="target-core" />
              <div className="target-coords">
                {target.fieldX.toFixed(1)}, {target.fieldY.toFixed(1)}
              </div>
            </div>
          );
        })}


        {(() => {
          const robotScreen = getRobotScreenPosition();
          return (
            <div
              className="robot-marker"
              style={{
                left: robotScreen.x,
                top: robotScreen.y,
                transform: `translate(-50%, -50%) rotate(${robotScreen.rotation}rad)`,
              }}
            >
              <div className="robot-triangle" />
            </div>
          );
        })()}

        {mousePos && (
          <div
            className="crosshair"
            style={{ left: mousePos.x, top: mousePos.y }}
          >
            <div className="crosshair-h" />
            <div className="crosshair-v" />
          </div>
        )}

        {/* HUD - Top Left */}
        <div className={`hud ${hudOpen ? 'open' : ''}`}>
          <button className="hud-toggle" onClick={(e) => { e.stopPropagation(); setHudOpen(!hudOpen); }}>
            {hudOpen ? '✕' : '☰'}
          </button>

          {hudOpen && (
            <div className="hud-panel">
              <div className="hud-row">
                <span className="hud-label">STATUS</span>
                <span className={`hud-value ${ntStatus.connected ? 'connected' : 'disconnected'}`}>
                  {ntStatus.connected ? 'CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>
              <div className="hud-row">
                <span className="hud-label">IP</span>
                <span className="hud-value">{ntStatus.ip}</span>
              </div>
              <div className="hud-row">
                <span className="hud-label">MODE</span>
                <span className="hud-value">{ntStatus.mode || '--'}</span>
              </div>
              <div className="hud-row">
                <span className="hud-label">ALLIANCE</span>
                <span className={`hud-value ${alliance}`}>{alliance.toUpperCase()}</span>
              </div>
              <div className="hud-row">
                <span className="hud-label">TARGET</span>
                <span className="hud-value">
                  {targets.length > 0
                    ? `${targets[0].fieldX.toFixed(1)}", ${targets[0].fieldY.toFixed(1)}"`
                    : '--'
                  }
                </span>
              </div>
              <div className="hud-row">
                <span className="hud-label">VIEW</span>
                <button
                  className="hud-rotate-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFieldRotation(prev => prev === 'vertical' ? 'horizontal' : 'vertical');
                  }}
                >
                  {fieldRotation === 'vertical' ? 'VERTICAL' : 'HORIZONTAL'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Bottom zone controls - collapsible */}
      <button
        className={`sidebar-toggle ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? '▼' : '▲'}
      </button>

      {sidebarOpen && (
        <div className={`sidebar ${alliance}`}>
          <div className="sidebar-buttons">
            <div className="alliance-label">
              {alliance.toUpperCase()}
            </div>

            <button
              className="zone-btn left-zone"
              onClick={() => handleZoneClick(currentZones.LEFT)}
              title="Set target to left zone"
            >
              <span className="btn-text">LEFT</span>
              <span className="btn-text">ZONE</span>
            </button>

            <button
              className="zone-btn middle-zone"
              onClick={() => handleZoneClick(currentZones.MIDDLE)}
              title="Set target to middle zone"
            >
              <span className="btn-text">MIDDLE</span>
              <span className="btn-text">ZONE</span>
            </button>

            <button
              className="zone-btn right-zone"
              onClick={() => handleZoneClick(currentZones.RIGHT)}
              title="Set target to right zone"
            >
              <span className="btn-text">RIGHT</span>
              <span className="btn-text">ZONE</span>
            </button>

            <button
              className="zone-btn clear-btn"
              onClick={handleClearTarget}
              title="Clear target"
            >
              <span className="btn-text">CLEAR</span>
              <span className="btn-text">TARGET</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
