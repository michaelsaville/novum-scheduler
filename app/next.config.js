/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Sharp loads native binaries via @img/sharp-*; explicitly include
  // them in the file-tracing output so the standalone tree carries them.
  outputFileTracingIncludes: {
    '/api/photos/**/*': ['./node_modules/@img/**/*'],
    '/tasks/**/*': ['./node_modules/@img/**/*'],
  },
  serverExternalPackages: ['sharp'],
};

module.exports = nextConfig;
