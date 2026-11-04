package com.pulse.api.service;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

class ChatFileStorageServiceTest {
    @Test
    void createsSmallerImageRenditionsForChatRecipients() throws Exception {
        BufferedImage original = new BufferedImage(1600, 1000, BufferedImage.TYPE_INT_RGB);
        Random random = new Random(42);
        for (int y = 0; y < original.getHeight(); y++) {
            for (int x = 0; x < original.getWidth(); x++) {
                original.setRGB(x, y, random.nextInt(0x1000000));
            }
        }
        Path source = Files.createTempFile("pulse-image-source-", ".png");
        Path preview = null;
        Path thumb = null;
        try {
            ImageIO.write(original, "png", source.toFile());
            preview = ChatFileStorageService.createImagePreview(original);
            thumb = ChatFileStorageService.createImageThumb(original);
            BufferedImage previewImage = ImageIO.read(preview.toFile());
            BufferedImage thumbImage = ImageIO.read(thumb.toFile());
            assertThat(previewImage.getWidth()).isEqualTo(1280);
            assertThat(previewImage.getHeight()).isEqualTo(800);
            assertThat(thumbImage.getWidth()).isEqualTo(320);
            assertThat(thumbImage.getHeight()).isEqualTo(200);
            assertThat(Files.size(preview)).isLessThan(Files.size(source));
            assertThat(Files.size(thumb)).isLessThan(Files.size(preview));
        } finally {
            Files.deleteIfExists(source);
            if (preview != null) Files.deleteIfExists(preview);
            if (thumb != null) Files.deleteIfExists(thumb);
        }
    }
}
