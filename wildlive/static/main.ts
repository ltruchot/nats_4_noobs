import '../lib/vendor.js'
import Globe from 'globe.gl'

// Expose for Rocket web component
;(window as Window & { Globe: typeof Globe }).Globe = Globe
