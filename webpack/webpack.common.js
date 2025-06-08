'use strict';

const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = {
    entry: {
        popup: './src/popup.js',  // Changed to popup.js instead of index.js
        content: './src/content.js',
        background: './src/background.js',
    },
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env', '@babel/preset-react']
                    }
                }
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif)$/i,
                type: 'asset/resource',
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/popup.html',  // Use src/popup.html as template
            filename: 'popup.html',
            chunks: ['popup']
        }),
        new CopyWebpackPlugin({
            patterns: [
                // Copy icons from public
                {
                    from: 'public/icons',
                    to: 'icons',
                    noErrorOnMissing: true
                },
                // Copy CSS files
                {
                    from: 'src/content.css',
                    to: 'content.css',
                    noErrorOnMissing: true
                },
                // Copy manifest
                { from: 'src/manifest.json', to: 'manifest.json' },
            ]
        })
    ],
    output: {
        path: path.resolve(__dirname, '../dist'),
        filename: '[name].js',
        clean: true
    },
    resolve: {
        extensions: ['.js', '.jsx']
    }
};