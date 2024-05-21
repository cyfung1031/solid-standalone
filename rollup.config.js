import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default [{
  input: 'src/atomic.js',
  output: {
    file: 'dist/atomic.min.js',
    format: 'iife'
  },
  plugins: [nodeResolve(), commonjs(), terser()]
}, {
  input: 'src/atomic.js',
  output: {
    file: 'dist/atomic.js',
    format: 'iife',
  },
  plugins: [nodeResolve(), commonjs()]
},{
  input: 'src/reactive.js',
  output: {
    file: 'dist/reactive.min.js',
    format: 'iife'
  },
  plugins: [nodeResolve(), commonjs(), terser()]
}, {
  input: 'src/reactive.js',
  output: {
    file: 'dist/reactive.js',
    format: 'iife',
  },
  plugins: [nodeResolve(), commonjs()]
}];