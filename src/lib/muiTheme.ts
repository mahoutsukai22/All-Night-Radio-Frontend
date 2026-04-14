import { alpha, createTheme } from '@mui/material/styles';

const panelBackground = 'linear-gradient(180deg, rgba(8, 25, 48, 0.96), rgba(5, 15, 28, 0.94))';
const surfaceBorder = 'rgba(116, 155, 196, 0.18)';
const glow = '0 0 24px rgba(104, 255, 220, 0.12), 0 0 48px rgba(74, 180, 255, 0.08), 0 24px 80px rgba(0, 0, 0, 0.28)';

export const appTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#66f2ff',
      contrastText: '#072236',
    },
    secondary: {
      main: '#3dd9c4',
    },
    background: {
      default: '#06111d',
      paper: '#081930',
    },
    text: {
      primary: '#e6f1ff',
      secondary: '#9db0c5',
    },
    error: {
      main: '#ffb3b3',
    },
    success: {
      main: '#98f4da',
    },
  },
  shape: {
    borderRadius: 20,
  },
  typography: {
    fontFamily: '"Space Grotesk", "Inter", sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 700,
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#06111d',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        fullWidth: true,
        variant: 'outlined',
        size: 'small',
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#c5d8ee',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          color: '#e6f1ff',
          background: 'rgba(9, 22, 41, 0.72)',
          borderRadius: 18,
          transition: 'box-shadow 160ms ease, border-color 160ms ease',
          '& fieldset': {
            borderColor: surfaceBorder,
          },
          '&:hover fieldset': {
            borderColor: alpha('#66f2ff', 0.6),
          },
          '&.Mui-focused': {
            boxShadow: '0 0 0 3px rgba(102, 242, 255, 0.12)',
          },
          '&.Mui-focused fieldset': {
            borderColor: '#66f2ff',
          },
          '& input::placeholder': {
            color: '#88a0bc',
            opacity: 1,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: `1px solid ${surfaceBorder}`,
          background: panelBackground,
          boxShadow: glow,
          borderRadius: 28,
          color: '#e6f1ff',
        },
      },
    },
    MuiModal: {
      defaultProps: {
        closeAfterTransition: true,
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(1, 7, 14, 0.7)',
          backdropFilter: 'blur(12px)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});
