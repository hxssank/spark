export function createRenderScheduler({ draw, requestFrame, cancelFrame, onError }) {
  let pending = null;
  let active = true;
  let previousTime = null;

  function request() {
    if (active && pending === null) pending = requestFrame(frame);
  }

  function frame(time) {
    pending = null;
    if (!active) return;
    const elapsed = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    try {
      if (draw(elapsed)) request();
      if (pending === null) previousTime = null;
    } catch (error) {
      setActive(false);
      if (onError) onError(error);
      else throw error;
    }
  }

  function setActive(value) {
    if (active === value) return;
    active = value;
    previousTime = null;
    if (active) {
      request();
    } else if (pending !== null) {
      cancelFrame(pending);
      pending = null;
    }
  }

  return { request, setActive };
}
