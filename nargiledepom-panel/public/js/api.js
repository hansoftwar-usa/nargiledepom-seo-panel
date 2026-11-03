async function request(path, { method = 'GET', body } = {}) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  if (method !== 'GET') window.dispatchEvent(new Event('api:start'));

  let res;
  try {
    res = await fetch(path, opts);
  } catch (_) {
    if (method !== 'GET') window.dispatchEvent(new Event('api:end'));
    throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }

  let data = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (method !== 'GET') window.dispatchEvent(new Event('api:end'));

  if (!res.ok) {
    if (res.status === 401 && !path.endsWith('/login') && !path.endsWith('/setup')) {
      window.dispatchEvent(new Event('auth:required'));
    }
    const err = new Error((data && data.error) || `İstek başarısız oldu (${res.status}).`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body = {}) => request(path, { method: 'POST', body }),
  put: (path, body = {}) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
