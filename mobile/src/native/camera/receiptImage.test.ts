import { prepareReceiptPhoto, receiptResize } from './receiptImage';
const mockResize = jest.fn();
const mockRelease = jest.fn();
const mockSave = jest.fn(async () => ({ uri: 'receipt.jpg', width: 1024, height: 512 }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: mockResize,
      release: mockRelease,
      renderAsync: async () => ({ release: mockRelease, saveAsync: mockSave }),
    }),
  },
}));
it('caps the longest dimension without upscaling and encodes at 0.85', async () => {
  expect(receiptResize(2000, 1000)).toEqual({ width: 1024 });
  expect(receiptResize(1000, 2000)).toEqual({ height: 1024 });
  expect(receiptResize(100, 200)).toBeNull();
  await prepareReceiptPhoto({ uri: 'photo.jpg', width: 2000, height: 1000 });
  expect(mockResize).toHaveBeenCalledWith({ width: 1024 });
  expect(mockSave).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.85 });
  expect(mockRelease).toHaveBeenCalledTimes(2);
});
