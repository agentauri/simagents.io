// Verification-only native clocks. Never imported by the public SPA/engine.
import { dlopen, FFIType, ptr } from 'bun:ffi';

export interface ClockReading { continuousMs: number; uptimeMs: number; wallMs: number }
export interface SoakClock { kind: string; read(): ClockReading; dispose(): void }

/** Includes system sleep, unlike performance.now() on several browsers/OSes.
 * Apple: https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time
 * Linux clock ids: include/uapi/linux/time.h (BOOTTIME=7, MONOTONIC=1).
 */
export function openSoakClock(): SoakClock {
  let disposed = false;
  if (process.platform === 'darwin') {
    const library = dlopen('/usr/lib/libSystem.B.dylib', {
      mach_continuous_time: { args: [], returns: FFIType.u64 },
      mach_absolute_time: { args: [], returns: FFIType.u64 },
      mach_timebase_info: { args: [FFIType.ptr], returns: FFIType.i32 },
    });
    const ratio = new Uint32Array(2);
    if (library.symbols.mach_timebase_info(ptr(ratio)) !== 0 || !ratio[0] || !ratio[1]) {
      library.close(); throw new Error('Native continuous clock unavailable');
    }
    const milliseconds = (ticks: bigint) => Number(ticks * BigInt(ratio[0]) / BigInt(ratio[1])) / 1e6;
    return {
      kind: 'darwin-mach-continuous-and-absolute',
      read() {
        if (disposed) throw new Error('Native clock disposed');
        return { continuousMs: milliseconds(library.symbols.mach_continuous_time()),
          uptimeMs: milliseconds(library.symbols.mach_absolute_time()), wallMs: Date.now() };
      },
      dispose() { if (!disposed) { disposed = true; library.close(); } },
    };
  }
  if (process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch)) {
    const library = dlopen('libc.so.6', { clock_gettime: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 } });
    const value = new BigInt64Array(2);
    const milliseconds = (clockId: number) => {
      if (library.symbols.clock_gettime(clockId, ptr(value)) !== 0) throw new Error('Native continuous clock unavailable');
      return Number(value[0]) * 1000 + Number(value[1]) / 1e6;
    };
    return {
      kind: 'linux-boottime-and-monotonic',
      read() {
        if (disposed) throw new Error('Native clock disposed');
        return { continuousMs: milliseconds(7), uptimeMs: milliseconds(1), wallMs: Date.now() };
      },
      dispose() { if (!disposed) { disposed = true; library.close(); } },
    };
  }
  throw new Error('No verified continuous native clock on this platform; the soak cannot pass.');
}

export function elapsedContinuous(start: ClockReading, current: ClockReading, previous = start): number {
  for (const reading of [start, previous, current]) {
    if (![reading.continuousMs, reading.uptimeMs, reading.wallMs].every(Number.isFinite)) throw new Error('Native clock reading unavailable');
  }
  if (current.continuousMs < previous.continuousMs || current.uptimeMs < previous.uptimeMs) throw new Error('Native clock regressed');
  const elapsed = current.continuousMs - start.continuousMs;
  const sleeping = elapsed - (current.uptimeMs - start.uptimeMs);
  if (Math.abs(sleeping) > 1000) throw new Error('System suspension interrupted the continuous soak');
  if (current.continuousMs - previous.continuousMs > 30000) throw new Error('Native sampling gap interrupted the continuous soak');
  return elapsed;
}
