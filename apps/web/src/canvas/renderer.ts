/**
 * Isometric renderer for Agents City
 * Inspired by IsoCity (MIT License)
 */

// Isometric tile dimensions
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

interface WorldState {
  tick: number;
  agents: Agent[];
  locations: Location[];
}

interface Agent {
  id: string;
  x: number;
  y: number;
  color: string;
  state: 'idle' | 'walking' | 'working' | 'sleeping';
}

interface Location {
  id: string;
  x: number;
  y: number;
  type: 'residential' | 'commercial' | 'industrial' | 'civic';
}

export class IsometricRenderer {
  private baseCtx: CanvasRenderingContext2D;
  private agentsCtx: CanvasRenderingContext2D;
  private effectsCtx: CanvasRenderingContext2D;
  private state: WorldState = { tick: 0, agents: [], locations: [] };
  private animationId: number = 0;
  private cameraX = 0;
  private cameraY = 0;

  constructor(
    baseCanvas: HTMLCanvasElement,
    agentsCanvas: HTMLCanvasElement,
    effectsCanvas: HTMLCanvasElement
  ) {
    this.baseCtx = baseCanvas.getContext('2d')!;
    this.agentsCtx = agentsCanvas.getContext('2d')!;
    this.effectsCtx = effectsCanvas.getContext('2d')!;

    // Center camera
    this.cameraX = baseCanvas.width / 2;
    this.cameraY = baseCanvas.height / 4;
  }

  /** Convert grid coords to screen coords (isometric projection) */
  private toScreen(x: number, y: number): [number, number] {
    const screenX = (x - y) * (TILE_WIDTH / 2) + this.cameraX;
    const screenY = (x + y) * (TILE_HEIGHT / 2) + this.cameraY;
    return [screenX, screenY];
  }

  /** Draw isometric tile */
  private drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    const [sx, sy] = this.toScreen(x, y);

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.lineTo(sx, sy + TILE_HEIGHT);
    ctx.lineTo(sx - TILE_WIDTH / 2, sy + TILE_HEIGHT / 2);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.stroke();
  }

  /** Draw base terrain grid */
  private drawBase() {
    const ctx = this.baseCtx;
    const { width, height } = ctx.canvas;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    for (let x = -5; x < 10; x++) {
      for (let y = -5; y < 10; y++) {
        const color = (x + y) % 2 === 0 ? '#2d2d44' : '#252538';
        this.drawTile(ctx, x, y, color);
      }
    }

    // Draw locations
    for (const loc of this.state.locations) {
      const colors: Record<string, string> = {
        residential: '#4ade80',
        commercial: '#60a5fa',
        industrial: '#fbbf24',
        civic: '#a78bfa',
      };
      this.drawTile(ctx, loc.x, loc.y, colors[loc.type] || '#666');
    }
  }

  /** Draw agents */
  private drawAgents() {
    const ctx = this.agentsCtx;
    const { width, height } = ctx.canvas;

    ctx.clearRect(0, 0, width, height);

    for (const agent of this.state.agents) {
      const [sx, sy] = this.toScreen(agent.x, agent.y);

      // Draw agent as circle
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = agent.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // State indicator
      if (agent.state === 'walking') {
        ctx.beginPath();
        ctx.arc(sx, sy - 15, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();
      }
    }
  }

  /** Update world state */
  updateState(state: Partial<WorldState>) {
    this.state = { ...this.state, ...state };
    this.drawBase();
  }

  /** Animation loop */
  private loop = () => {
    this.drawAgents();
    this.animationId = requestAnimationFrame(this.loop);
  };

  /** Start rendering */
  start() {
    // Demo data
    this.state = {
      tick: 0,
      agents: [
        { id: 'a1', x: 2, y: 2, color: '#ef4444', state: 'idle' },
        { id: 'a2', x: 4, y: 3, color: '#3b82f6', state: 'walking' },
        { id: 'a3', x: 1, y: 5, color: '#10b981', state: 'working' },
      ],
      locations: [
        { id: 'l1', x: 0, y: 0, type: 'civic' },
        { id: 'l2', x: 3, y: 1, type: 'commercial' },
        { id: 'l3', x: 5, y: 4, type: 'residential' },
        { id: 'l4', x: 2, y: 6, type: 'industrial' },
      ],
    };

    this.drawBase();
    this.loop();
  }

  /** Stop rendering */
  stop() {
    cancelAnimationFrame(this.animationId);
  }
}
