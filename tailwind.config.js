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
  theme: {
    extend: {},
  },
  plugins: [],
};
