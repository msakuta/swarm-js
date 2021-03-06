const presets = [
    [
      "@babel/env",
      {
        targets: "> 0.25%, not dead",
        useBuiltIns: "entry",
        corejs: 2,
      },
    ],
  ];
  
  module.exports = { presets, sourceMaps: true,
    plugins: [
      "@babel/plugin-proposal-class-properties"
    ]
  };
