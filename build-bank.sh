#!/bin/sh
set -eu

cd "$(dirname "$0")"

{
  echo "// 自動合併：由 build-bank.sh 從 data/g*.js 產生，請勿手動修改。"
  echo "window.BANK = window.BANK || [];"
  for file in $(find data -maxdepth 1 -type f -name 'g*.js' ! -name 'bank.js' | sort -r); do
    cat "$file"
  done
} > data/bank.js

printf 'bank.js 生成完成：%s bytes\n' "$(wc -c < data/bank.js)"
