import { useState, useRef, useCallback, useEffect } from 'react';
import { initNetworkTables, publishTarget, clearTarget, subscribeToAlliance, onConnectionChange, NT_CONFIG } from '../networktables';
import './App.css';

const FIELD = {
  X: 651.2,
  Y: 317.7,
};

function App() {
  const [ntStatus, setNtStatus] = useState({ connected: false, ip: '' });
  const [hudOpen, setHudOpen] = useState(true);
  const [alliance, setAlliance] = useState('red');
  const [targets, setTargets] = useState([]);
  const [mousePos, setMousePos] = useState(null);
  const [hoveredDot, setHoveredDot] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [fieldRotation, setFieldRotation] = useState('vertical');
  const [imageLoaded, setImageLoaded] = useState(false);
  const fieldRef = useRef(null);

  const GRID_SPACING = 28;
  const [gridDots, setGridDots] = useState([]);

  // ALL UPDATES IN 4 EFFECTS
  useEffect(() => {
    const team = NT_CONFIG.TEAM_NUMBER;
    const ip = team > 0 ? `10.${Math.floor(team / 100)}.${team % 100}.2` : NT_CONFIG.SERVER;

    setNtStatus(prev => ({ ...prev, ip }));

    onConnectionChange((connected) => {
      setNtStatus(prev => ({ ...prev, connected }));

      // Clear targets when connected
      if (connected) {
        setTargets([]);
      }
    });

    initNetworkTables().then((connected) => {
      setNtStatus(prev => ({ ...prev, connected }));

      if (connected) {
        setTargets([]); // Clear on initial connect too
        subscribeToAlliance((color) => {
          if (color === 'red' || color === 'blue') setAlliance(color);
        });
      }
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

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;
    if (!imageLoaded) return;

    const img = fieldRef.current?.querySelector('img');
    if (!img) return;

    const imgRect = img.getBoundingClientRect();
    const containerRect = fieldRef.current.getBoundingClientRect();

    const imgLeft = imgRect.left - containerRect.left;
    const imgTop = imgRect.top - containerRect.top;
    const imgRight = imgLeft + imgRect.width;
    const imgBottom = imgTop + imgRect.height;

    const dots = [];
    for (let x = GRID_SPACING; x < dimensions.width; x += GRID_SPACING) {
      for (let y = GRID_SPACING; y < dimensions.height; y += GRID_SPACING) {
        if (x > imgLeft && x < imgRight && y > imgTop && y < imgBottom) {
          dots.push({ x, y });
        }
      }
    }
    setGridDots(dots);
  }, [dimensions, alliance, fieldRotation, imageLoaded]);

  useEffect(() => {
    if (targets.length === 0) return;

    const timer = setTimeout(() => {
      setTargets([]);
      clearTarget();
    }, 5000);

    return () => clearTimeout(timer);
  }, [targets]);

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

    if (fieldRotation === 'vertical') {
      if (alliance === 'blue') {
        fieldX = (1 - relY) * FIELD.X;
        fieldY = relX * FIELD.Y;
      } else {
        fieldX = relY * FIELD.X;
        fieldY = (1 - relX) * FIELD.Y;
      }
    } else {
      if (alliance === 'blue') {
        fieldX = relX * FIELD.X;
        fieldY = relY * FIELD.Y;
      } else {
        fieldX = (1 - relX) * FIELD.X;
        fieldY = (1 - relY) * FIELD.Y;
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

    const imgX = fieldX / FIELD.X;
    const imgY = fieldY / FIELD.Y;

    let relX, relY;

    if (fieldRotation === 'vertical') {
      if (alliance === 'blue') {
        relX = imgY;
        relY = 1 - imgX;
      } else {
        relX = 1 - imgY;
        relY = imgX;
      }
    } else {
      if (alliance === 'blue') {
        relX = imgX;
        relY = imgY;
      } else {
        relX = 1 - imgX;
        relY = 1 - imgY;
      }
    }

    return {
      x: relX * imgRect.width + imgLeft,
      y: relY * imgRect.height + imgTop,
    };
  }, [alliance, fieldRotation]);

  // Handle field clicks to set targets
  const handleFieldClick = useCallback((e) => {
    if (!fieldRef.current) return;

    const rect = fieldRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Check if click is within image bounds
    const img = fieldRef.current.querySelector('img');
    if (!img) return;

    const imgRect = img.getBoundingClientRect();
    const imgLeft = imgRect.left - rect.left;
    const imgTop = imgRect.top - rect.top;
    const imgRight = imgLeft + imgRect.width;
    const imgBottom = imgTop + imgRect.height;

    if (screenX < imgLeft || screenX > imgRight || screenY < imgTop || screenY > imgBottom) {
      return;
    }

    const fieldCoords = screenToField(screenX, screenY);

    // Validate field coordinates are within bounds
    if (fieldCoords.x < 0 || fieldCoords.x > FIELD.X || fieldCoords.y < 0 || fieldCoords.y > FIELD.Y) {
      return;
    }

    const newTarget = {
      id: `target-${Date.now()}`,
      screenX,
      screenY,
      fieldX: fieldCoords.x,
      fieldY: fieldCoords.y,
      timestamp: Date.now(),
    };

    // console.log(`AIRSTRYKE TARGET - X: ${fieldCoords.x}, Y: ${fieldCoords.y}`);

    if (ntStatus.connected) {
      publishTarget({ x: fieldCoords.x, y: fieldCoords.y });
    }

    setTargets([newTarget]);
  }, [screenToField, ntStatus.connected]);

  // Handle mouse movement to find nearest grid dot and calculate dynamic styles
  const handleMouseMove = useCallback((e) => {
    if (!fieldRef.current) return;

    const rect = fieldRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x, y });

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
  }, [gridDots]);

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

  return (
    <div className={`app ${alliance}`}>
      <div
        ref={fieldRef}
        className="field"
        onClick={handleFieldClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setMousePos(null); setHoveredDot(null); }}
      >
        <img
          src="/2026RebuiltField.png"
          alt="Field"
          className={`field-image ${alliance} ${fieldRotation}`}
          onLoad={() => setImageLoaded(true)}
        />

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

        {mousePos && (
          <div
            className="crosshair"
            style={{ left: mousePos.x, top: mousePos.y }}
          >
            <div className="crosshair-h" />
            <div className="crosshair-v" />
          </div>
        )}

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
    </div>
  );
}

export default App;