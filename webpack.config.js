const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

module.exports = (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: {
      bundle: "./src/index.ts",
      "prefill-config": "./src/prefill-config.ts",
    },
    devtool: isProduction ? "source-map" : "inline-source-map",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
      ],
    },
    externals: { "node:fs": "{}" },
    performance: { hints: false },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      fallback: {
        module: false,
      },
    },
    output: {
      filename: "[name].js",
      path: path.resolve(__dirname, "dist"),
      clean: true,
      publicPath: isProduction ? "./" : "/",
      library: {
        name: "PrefillModule",
        type: "window",
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./index.html",
        inject: "body",
        minify: false,
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: "static",
            to: "static",
          },
        ],
      }),
    ],
    devServer: {
      static: {
        directory: path.join(__dirname, "dist"),
      },
      compress: true,
      port: 2000,
      open: true,
    },
    experiments: {
      asyncWebAssembly: true,
    },
  };
};
