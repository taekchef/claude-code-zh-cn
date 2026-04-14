ZH_CN_LAUNCHER_BIN_DIR="${ZH_CN_LAUNCHER_BIN_DIR:-$HOME/.claude/bin}"

case ":$PATH:" in
    *":$ZH_CN_LAUNCHER_BIN_DIR:"*)
        ;;
    *)
        export PATH="$ZH_CN_LAUNCHER_BIN_DIR:$PATH"
        ;;
esac
