import { NextResponse } from 'next/server';

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Booteh API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
    <style>
      body { margin: 0; background-color: #0f172a; }
      #swagger-ui { max-width: 100%; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: '/api/docs/swagger',
          dom_id: '#swagger-ui',
          docExpansion: 'none',
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.SwaggerUIStandalonePreset
          ],
        });
      };
    </script>
  </body>
</html>`;

export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    },
  });
}
