// Hàng đợi trong bộ nhớ, giới hạn số job chạy cùng lúc.
// Đủ cho prototype chạy 1 tiến trình. Khi chạy nhiều server cần chuyển sang
// hàng đợi dùng chung (Redis/BullMQ hoặc bảng Postgres).

export function createQueue(concurrency, worker) {
  const pending = [];
  let running = 0;

  function next() {
    while (running < concurrency && pending.length > 0) {
      const job = pending.shift();
      running++;
      Promise.resolve()
        .then(() => worker(job))
        .catch((err) => console.error("Job lỗi ngoài dự kiến:", err))
        .finally(() => {
          running--;
          next();
        });
    }
  }

  return {
    push(job) {
      pending.push(job);
      next();
    },
    get size() {
      return pending.length + running;
    },
  };
}
