export default function NotFound() {
  return (
    <main style={{ fontFamily: 'Inter, sans-serif', padding: 32, maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>This link is not available</h1>
      <p style={{ color: '#52514e', marginTop: 8 }}>
        The share link is unknown, has expired, or was revoked by the organization that created it.
      </p>
    </main>
  );
}
