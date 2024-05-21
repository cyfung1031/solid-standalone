import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default [{
  input: 'src/html.js',
  output: {
    file: 'dist/html.min.js',
    format: 'iife'
  },
  plugins: [nodeResolve(), commonjs(), terser()]
},{
  input: 'src/html.js',
  output: {
    file: 'dist/html.js',
    format: 'iife'
  },
  plugins: [nodeResolve(), commonjs()]
}];