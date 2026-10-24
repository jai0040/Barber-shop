import { Global, Module } from '@nestjs/common';
import { ImageService } from './image.service';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';
@Global() @Module({ providers: [StorageService, ImageService, FilesService], exports: [StorageService, ImageService, FilesService] })
export class FilesModule {}
