import React from 'react';
import { AlertCircle, FileText, CheckCircle2, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  targetDetails?: {
    type: 'Google Doc' | 'Google Form';
    fileName: string;
    destination: string;
  };
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  targetDetails,
  confirmLabel = 'Confirm & Proceed',
  cancelLabel = 'Cancel',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-left">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              {title}
            </h3>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1.5 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {targetDetails && (
          <div className="mt-4 p-3.5 bg-stone-50 dark:bg-stone-800/60 rounded-xl border border-stone-200/80 dark:border-stone-700/80 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-stone-500">Service:</span>
              <span className="font-semibold text-stone-800 dark:text-stone-200">
                {targetDetails.type}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Item Name:</span>
              <span className="font-semibold text-stone-800 dark:text-stone-200 truncate max-w-[200px]">
                {targetDetails.fileName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Location:</span>
              <span className="text-stone-700 dark:text-stone-300">
                {targetDetails.destination}
              </span>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg shadow-sm transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
