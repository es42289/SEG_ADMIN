/**
 * Tailwind CSS configuration for Django templates.
 * Content paths are scoped to templates and static JS to enable purging.
 */
module.exports = {
  content: [
    './myproject/mapapp/templates/**/*.html',
    './myproject/templates/**/*.html',
    './myproject/mapapp/static/mapapp/js/**/*.js'
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
        sm: '1.5rem',
        md: '2rem',
      },
    },
    extend: {},
  },
  plugins: [],
};
