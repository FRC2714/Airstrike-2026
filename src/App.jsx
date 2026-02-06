import { useState, useRef, useCallback, useEffect } from 'react';
import { initNetworkTables, publishTarget, clearTarget, subscribeToAlliance, onConnectionChange, NT_CONFIG } from './networktables';
import './App.css';

const FIELD = {
  X: 651.2,
  Y: 317.7,
};

function App() {
  const [ntStatus, setNtStatus] = useState({ connected: false, ip: '' });
  const [hudOpen, setHudOpen] = useState(false);
  const [alliance, setAlliance] = useState('red');
  const [targets, setTargets] = useState([]);
  const [mousePos, setMousePos] = useState(null);
  const [hoveredDot, setHoveredDot] = useState(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const fieldRef = useRef(null);

  const GRID_SPACING = 28;
  const [gridDots, setGridDots] = useState([]);

  useEffect(() => {
    const team = NT_CONFIG.TEAM_NUMBER;
    const ip = team > 0 ? `10.${Math.floor(team / 100)}.${team % 100}.2` : NT_CONFIG.SERVER;

    setNtStatus(prev => ({ ...prev, ip }));

    // Listen for connection changes
    onConnectionChange((connected) => {
      setNtStatus(prev => ({ ...prev, connected }));
    });

    initNetworkTables().then((connected) => {
      setNtStatus(prev => ({ ...prev, connected }));

      if (connected) {
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

    const dots = [];
    for (let x = GRID_SPACING; x < dimensions.width; x += GRID_SPACING) {
      for (let y = GRID_SPACING; y < dimensions.height; y += GRID_SPACING) {
        dots.push({ x, y });
      }
    }
    setGridDots(dots);
  }, [dimensions]);

  useEffect(() => {
    if (targets.length === 0) return;

    const timer = setTimeout(() => {
      setTargets([]);
      clearTarget();
    }, 5000);

    return () => clearTimeout(timer);
  }, [targets]);

  const screenToField = useCallback((screenX, screenY) => {
    const img = fieldRef.current?.querySelector('img');
    if (!img) return { x: 0, y: 0 };

    const container = fieldRef.current.getBoundingClientRect();

    const imgNatural = { w: img.naturalWidth, h: img.naturalHeight };
    const imgAspect = imgNatural.w / imgNatural.h;
    const containerAspect = container.width / container.height;

    let rendered, offset;

    if (containerAspect > imgAspect) {
      rendered = { w: container.width, h: container.width / imgAspect };
      offset = { x: 0, y: (container.height - rendered.h) / 2 };
    } else {
      rendered = { w: container.height * imgAspect, h: container.height };
      offset = { x: (container.width - rendered.w) / 2, y: 0 };
    }

    let imgX = (screenX - offset.x) / rendered.w;
    let imgY = (screenY - offset.y) / rendered.h;

    // Flip coordinates for red alliance (image is rotated 180deg)
    if (alliance === 'red') {
      imgX = 1 - imgX;
      imgY = 1 - imgY;
    }

    return {
      x: parseFloat((imgX * FIELD.X).toFixed(2)),
      y: parseFloat((imgY * FIELD.Y).toFixed(2))
    };
  }, [alliance]);

  const fieldToScreen = useCallback((fieldX, fieldY) => {
    const img = fieldRef.current?.querySelector('img');
    if (!img) return { x: 0, y: 0 };

    const container = fieldRef.current.getBoundingClientRect();
    const imgNatural = { w: img.naturalWidth, h: img.naturalHeight };
    const imgAspect = imgNatural.w / imgNatural.h;
    const containerAspect = container.width / container.height;

    let rendered, offset;

    if (containerAspect > imgAspect) {
      rendered = { w: container.width, h: container.width / imgAspect };
      offset = { x: 0, y: (container.height - rendered.h) / 2 };
    } else {
      rendered = { w: container.height * imgAspect, h: container.height };
      offset = { x: (container.width - rendered.w) / 2, y: 0 };
    }

    let imgX = fieldX / FIELD.X;
    let imgY = fieldY / FIELD.Y;

    // Flip for red alliance
    if (alliance === 'red') {
      imgX = 1 - imgX;
      imgY = 1 - imgY;
    }

    return {
      x: (imgX * rendered.w) + offset.x,
      y: (imgY * rendered.h) + offset.y,
    };
  }, [alliance]);

  const handleFieldClick = useCallback((e) => {
    if (!fieldRef.current) return;

    const rect = fieldRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    const fieldCoords = screenToField(screenX, screenY);

    const newTarget = {
      id: `target-${Date.now()}`,
      screenX,
      screenY,
      fieldX: fieldCoords.x,
      fieldY: fieldCoords.y,
      timestamp: Date.now(),
    };

    console.log(`AIRSTRYKE TARGET - X: ${fieldCoords.x}, Y: ${fieldCoords.y}`);

    publishTarget({ x: fieldCoords.x, y: fieldCoords.y });

    setTargets([newTarget]);
  }, [screenToField]);

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
          className={`field-image ${alliance === 'red' ? 'flipped' : ''}`}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;