// Kill-switch: desinstala cualquier service worker previo y limpia cachés.
// (El PWA offline se reintroducirá más adelante con una estrategia robusta.)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clientes = await self.clients.matchAll({ type: "window" });
    clientes.forEach((c) => c.navigate(c.url));
  } catch (e) {}
})()));
