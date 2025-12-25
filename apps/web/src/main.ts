import { IsometricRenderer } from './canvas/renderer';

// Initialize canvases
const container = document.getElementById('canvas-container')!;
const baseCanvas = document.getElementById('base-layer') as HTMLCanvasElement;
const agentsCanvas = document.getElementById('agents-layer') as HTMLCanvasElement;
const effectsCanvas = document.getElementById('effects-layer') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;

// Resize canvases to container
function resizeCanvases() {
  const { width, height } = container.getBoundingClientRect();
  [baseCanvas, agentsCanvas, effectsCanvas].forEach(canvas => {
    canvas.width = width;
    canvas.height = height;
  });
}

resizeCanvases();
window.addEventListener('resize', resizeCanvases);

// Initialize renderer
const renderer = new IsometricRenderer(baseCanvas, agentsCanvas, effectsCanvas);
renderer.start();

// Connect to SSE
function connectSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    statusEl.textContent = 'Connected';
    statusEl.className = 'connected';
  };

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Event:', data);

    if (data.type === 'world_update') {
      renderer.updateState(data);
    }
  };

  eventSource.onerror = () => {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'disconnected';
    eventSource.close();
    // Reconnect after 3 seconds
    setTimeout(connectSSE, 3000);
  };
}

connectSSE();

console.log('🏙️ Agents City frontend initialized');
