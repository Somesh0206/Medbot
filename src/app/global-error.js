'use client';

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <head>
        <title>Error - MedBot Studio</title>
      </head>
      <body style={{ backgroundColor: '#090d16', color: '#e2e8f0', fontFamily: 'sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#ef4444' }}>System Error Encountered</h2>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>An unexpected error occurred in the application framework.</p>
        <button
          onClick={() => reset()}
          style={{
            backgroundColor: '#06b6d4',
            color: '#ffffff',
            border: 'none',
            padding: '0.6rem 1.2rem',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          Try Again
        </button>
      </body>
    </html>
  );
}
