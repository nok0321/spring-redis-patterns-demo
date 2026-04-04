/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        redis: {
          bg:      '#0d1117',
          surface: '#161b22',
          border:  '#30363d',
          muted:   '#484f58',
          text:    '#e6edf3',
          dim:     '#8b949e',
          green:   '#3fb950',
          cyan:    '#39d0d0',
          amber:   '#d29922',
          red:     '#f85149',
          purple:  '#a371f7',
          blue:    '#58a6ff',
          pink:    '#f778ba',
          orange:  '#ffa657',
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "'Cascadia Code'", 'monospace'],
      },
    },
  },
  plugins: [],
}
