import { RefreshCw, WifiOff, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ServerDownBannerProps {
  isDown: boolean;
  onRetry?: () => void;
  onClose?: () => void;
  isRetrying?: boolean;
}

const ServerDownBanner: React.FC<ServerDownBannerProps> = ({
  isDown,
  onRetry,
  onClose,
  isRetrying,
}) => {
  return (
    <AnimatePresence>
      {isDown && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="absolute top-0 left-0 right-0 z-[1000] w-full"
        >
          <div className="bg-destructive/15 border-b border-destructive/20 backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-4 shadow-[0_4px_20px_-5px_rgba(239,68,68,0.2)]">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center text-destructive">
                  <WifiOff className="w-5 h-5" />
                </div>
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-destructive/20 rounded-xl -z-10"
                />
              </div>
              <div>
                <h3 className="text-sm font-bold text-destructive tracking-tight flex items-center gap-2">
                  System Connection Interrupted
                </h3>
                <p className="text-xs text-muted-foreground/80 font-medium">
                  We're having trouble reaching the server. We'll be back soon!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onRetry}
                disabled={isRetrying}
                className="group relative flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-white text-xs font-bold hover:bg-destructive/90 transition-all active:scale-95 disabled:opacity-50 overflow-hidden shadow-lg shadow-destructive/20"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 transition-transform duration-500 ${isRetrying ? "animate-spin" : "group-hover:rotate-180"}`}
                />
                <span className="relative z-10">
                  {isRetrying ? "Reconnecting..." : "Reconnect Now"}
                </span>
                
                {/* Shine effect */}
                <motion.div
                  initial={{ left: "-100%" }}
                  animate={{ left: "100%" }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
                  className="absolute top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12"
                />
              </button>

              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-destructive/10 text-destructive transition-colors active:scale-90"
                aria-label="Close banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Animated glow line */}
          <motion.div 
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="h-[1px] w-full bg-gradient-to-r from-transparent via-destructive/40 to-transparent" 
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ServerDownBanner;
