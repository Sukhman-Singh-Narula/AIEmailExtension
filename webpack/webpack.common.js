'use strict';

const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = {
    entry: {
        popup: './src/index.js',
        content: './src/content.js',
        background: './src/background.js',
        pageWorld: '@inboxsdk/core/pageWorld.js',
        inboxSDKBackground: '@inboxsdk/core/background.js',
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
            template: './public/index.html',
            filename: 'popup.html',
            chunks: ['popup']
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public', to: '.', globOptions: { ignore: ['**/index.html'] } },
                { from: 'src/content.css', to: '.' },
                { from: 'public/icons', to: 'icons' },
                { from: 'src/manifest.json', to: 'manifest.json' },
            ]
        })
    ],
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        clean: true
    },
    resolve: {
        extensions: ['.js', '.jsx']
    }
};